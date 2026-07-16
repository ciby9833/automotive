import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Order } from '../orders/entities/order.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { Yard } from '../yards/entities/yard.entity';
import { YardSlot, YardSlotStatus } from '../yards/entities/yard-slot.entity';
import { Waybill } from '../waybills/entities/waybill.entity';
import { WaybillVin } from '../waybills/entities/waybill-vin.entity';
import { Carrier } from '../carriers/entities/carrier.entity';
import { TransportType } from '../../common/enums/order-type.enum';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { WaybillStatus } from '../../common/enums/waybill-status.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { ImportOutboundOrderDto } from './dto/import-outbound-order.dto';
import { PlanWaybillDto } from './dto/plan-waybill.dto';

// 出库业务：客户 Excel 导入 → 出库订单 → 开单 (planWaybill) → 运单
// 与 inbound 对称：一份 Excel = 一张 Order(DELIVERY) + N 条 OrderVin (预填经销店/拖车类型/分组)
// 开单不再新增 VIN，只是把已到仓的 OrderVin 打包成 Waybill 交给承运商
@Injectable()
export class OutboundService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderVin)
    private readonly orderVinsRepo: Repository<OrderVin>,
    @InjectRepository(Yard)
    private readonly yardRepo: Repository<Yard>,
    @InjectRepository(Carrier)
    private readonly carrierRepo: Repository<Carrier>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
  ) {}

  // ============ 1. Excel 导入 ============
  // 一份 Excel = 一张出库订单 + N 条 VIN
  // 与入库不同：出库 VIN 必须已经在系统里 (客户不能凭空发一台我们没入过库的车)
  async importOutboundOrder(
    dto: ImportOutboundOrderDto,
    scope: EffectiveScope,
  ): Promise<{
    orderId: string;
    orderCode: string;
    matched: number;
    missing: string[];
  }> {
    const yard = await this.yardRepo.findOne({
      where: { id: dto.originYardId },
    });
    if (!yard) throw new NotFoundException('始发场地不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);

    // 入参内自我去重
    const seen = new Set<string>();
    const uniqueVins = dto.vins.filter((v) => {
      if (seen.has(v.vin)) return false;
      seen.add(v.vin);
      return true;
    });

    // 出库 VIN 必须已存在系统 (入库过) 且属于同一客户
    const existing = await this.orderVinsRepo.find({
      where: { vin: In(uniqueVins.map((v) => v.vin)) },
      relations: { order: true },
    });
    const existingMap = new Map(existing.map((e) => [e.vin, e]));
    const missing: string[] = [];
    const toUpdate: Array<{ vin: OrderVin; row: (typeof uniqueVins)[number] }> =
      [];
    for (const row of uniqueVins) {
      const found = existingMap.get(row.vin);
      if (!found) {
        missing.push(row.vin);
        continue;
      }
      // 客户不能出别家客户的车
      if (found.order && found.order.customerId !== dto.customerId) {
        missing.push(row.vin);
        continue;
      }
      toUpdate.push({ vin: found, row });
    }

    if (toUpdate.length === 0) {
      throw new BadRequestException(
        `导入的 ${uniqueVins.length} 个 VIN 全部不在系统中或客户不匹配，请先入库`,
      );
    }

    return this.dataSource.transaction(async (mgr) => {
      const orderCode = `OUT-${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`;
      const orderRepo = mgr.getRepository(Order);
      const vinRepo = mgr.getRepository(OrderVin);

      // 出库单头：destination_yard_id 在 DELIVERY 场景里存的是"始发仓 id"
      // (语义反着用是历史包袱：字段建于入库时代)。真正的目的地在 order_vins.dealer_code
      const orderData: Partial<Order> = {
        orderCode,
        customerOrderNo: dto.customerOrderNo,
        organizationId: yard.organizationId,
        customerId: dto.customerId,
        transportType: TransportType.DELIVERY,
        destinationYardId: dto.originYardId,
        remark: dto.remark,
      };
      const savedOrder = await orderRepo.save(orderRepo.create(orderData));

      // 现有 OrderVin 上打上出库属性 (dealer/towType/group)
      // 不改 orderId，因为 VIN 原始入库单据要保留追溯
      for (const { vin, row } of toUpdate) {
        vin.dealerCode = row.dealerCode ?? null;
        vin.dealerName = row.dealerName ?? null;
        vin.towType = row.towType ?? null;
        vin.groupCode = row.groupCode ?? null;
      }
      await vinRepo.save(toUpdate.map((x) => x.vin));

      return {
        orderId: savedOrder.id,
        orderCode: savedOrder.orderCode,
        matched: toUpdate.length,
        missing,
      };
    });
  }

  // ============ 2. 出库订单列表 ============
  async listOutboundOrders(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      customerOrderNo?: string;
      organizationId?: string;
      status?: 'ALL' | 'PENDING' | 'COMPLETED';
    },
  ) {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .where('order.transportType = :type', { type: TransportType.DELIVERY })
      .orderBy('order.createdAt', 'DESC');
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
      narrowToOrgId: filters.organizationId,
    });
    if (filters.customerId) {
      qb.andWhere('order.customerId = :cid', { cid: filters.customerId });
    }
    if (filters.customerOrderNo) {
      qb.andWhere('order.customerOrderNo ILIKE :cno', {
        cno: `%${filters.customerOrderNo}%`,
      });
    }
    const orders = await qb.getMany();
    if (orders.length === 0) return [];

    // 出库订单进度：按客户订单号 + dealerCode 关联 VIN
    // 但 OrderVin.orderId 是入库订单 id，不是出库订单 id — 出库不重建 VIN
    // 用 customerOrderNo 做匹配：客户发货 Excel 里的 customerOrderNo 就是我们的桥
    // 简化统计：按 dealer_code + 时间窗关联比较复杂，第一版直接算"每单绑定的 waybill_vin 数"
    // 这里返回 order 头，进度先靠详情页展开算
    return orders.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      customerOrderNo: o.customerOrderNo,
      customerName: o.customer?.name ?? '-',
      originYardName: o.destinationYard?.name ?? '-',
      organizationId: o.organizationId,
      organizationName: o.organization?.name ?? '-',
      createdAt: o.createdAt,
    }));
  }

  async getOutboundOrderDetail(id: string, scope: EffectiveScope) {
    // 只返订单头：出库订单本身不持有 VIN (VIN 一直挂在原入库订单上)，
    // 详情页看池子请去 /outbound/plan (那里有专门的可开单 VIN 池 + 筛选)
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .where('order.id = :id', { id })
      .andWhere('order.transportType = :type', {
        type: TransportType.DELIVERY,
      });
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
    });
    const order = await qb.getOne();
    if (!order) throw new NotFoundException('出库订单不存在');
    return { order };
  }

  // ============ 3. 可用于开单的 VIN 池 ============
  // 库存中已到仓 + 未分配 + 属于本客户的 VIN
  async listAvailableVinsForPlan(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      yardId?: string;
      dealerCode?: string;
      groupCode?: string;
    },
  ): Promise<OrderVin[]> {
    const qb = this.orderVinsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.order', 'origOrder')
      .leftJoinAndSelect('origOrder.customer', 'customer')
      .leftJoinAndSelect('v.slot', 'slot')
      .leftJoinAndSelect('slot.yard', 'yard')
      .where('v.arrival_status = :arrived', {
        arrived: OrderVinArrivalStatus.ARRIVED,
      })
      .andWhere('v."isAllocated" = false')
      .andWhere('v.dealer_code IS NOT NULL')
      .orderBy('v.dealerCode', 'ASC')
      .addOrderBy('v.vin', 'ASC');

    if (scope.type === 'ORG') {
      qb.andWhere('origOrder.organizationId IN (:...__orgIds)', {
        __orgIds: scope.orgIds,
      });
    } else if (scope.type === 'CUSTOMER') {
      qb.andWhere('origOrder.customerId = :__cid', { __cid: scope.customerId });
    } else {
      // CARRIER 不参与开单
      return [];
    }

    if (filters.customerId) {
      qb.andWhere('origOrder.customerId = :cid', { cid: filters.customerId });
    }
    if (filters.yardId) {
      qb.andWhere('slot.yard_id = :yid', { yid: filters.yardId });
    }
    if (filters.dealerCode) {
      qb.andWhere('v.dealer_code = :dc', { dc: filters.dealerCode });
    }
    if (filters.groupCode) {
      qb.andWhere('v.group_code = :gc', { gc: filters.groupCode });
    }
    return qb.getMany();
  }

  // ============ 4. 开单：生成 Waybill ============
  async planWaybill(dto: PlanWaybillDto, scope: EffectiveScope): Promise<Waybill> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('仅内部账号可开单');
    }
    const yard = await this.yardRepo.findOne({
      where: { id: dto.originYardId },
    });
    if (!yard) throw new NotFoundException('始发场地不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);

    const carrier = await this.carrierRepo.findOne({
      where: { id: dto.carrierId },
    });
    if (!carrier) throw new NotFoundException('承运商不存在');

    return this.dataSource.transaction(async (mgr) => {
      const vinRepo = mgr.getRepository(OrderVin);
      const waybillRepo = mgr.getRepository(Waybill);
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const slotRepo = mgr.getRepository(YardSlot);

      // 锁行：并发开单同一 VIN 时，让第二个事务在此等待
      // Postgres 不允许 FOR UPDATE 落到 LEFT JOIN 的可空 side，所以只锁 order_vins 主表
      // slot / origOrder 关联通过 setLock 的第三参 lockTables 排除
      const vins = await vinRepo
        .createQueryBuilder('v')
        .setLock('pessimistic_write', undefined, ['v'])
        .leftJoinAndSelect('v.slot', 'slot')
        .leftJoinAndSelect('v.order', 'origOrder')
        .where('v.id IN (:...ids)', { ids: dto.orderVinIds })
        .getMany();

      if (vins.length !== dto.orderVinIds.length) {
        throw new BadRequestException('部分 VIN 不存在');
      }
      const dealerNames = new Set<string>();
      for (const v of vins) {
        if (v.arrivalStatus !== OrderVinArrivalStatus.ARRIVED) {
          throw new BadRequestException(`VIN ${v.vin} 未到仓，不能开单`);
        }
        if (v.isAllocated) {
          throw new ConflictException(`VIN ${v.vin} 已被开单，请刷新页面`);
        }
        if (!v.dealerCode) {
          throw new BadRequestException(
            `VIN ${v.vin} 未指定经销店，请客户先出单再开单`,
          );
        }
        if (v.slot?.yardId && v.slot.yardId !== dto.originYardId) {
          throw new BadRequestException(
            `VIN ${v.vin} 不在指定的始发场地`,
          );
        }
        dealerNames.add(v.dealerName ?? v.dealerCode);
      }
      // 一张 Waybill 只允许送同一经销店 — 业务规则
      if (dealerNames.size > 1) {
        throw new BadRequestException(
          '一张运单只能派往同一经销店，请分单',
        );
      }

      // 建 Waybill：类型显式化以规避 TypeORM.create 的数组重载解析
      const waybillCode = `WB${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`;
      const waybillData: Partial<Waybill> = {
        waybillCode,
        organizationId: yard.organizationId,
        customerWaybillCode: dto.customerWaybillCode ?? undefined,
        transportType: TransportType.DELIVERY,
        orderId: null,
        originYardId: dto.originYardId,
        originText: yard.name,
        destinationYardId: null,
        destinationDealerId: null,
        carrierId: dto.carrierId,
        driverId: dto.driverId ?? null,
        vehicleId: dto.vehicleId ?? null,
        towType: dto.towType ?? null,
        remark: dto.remark ?? undefined,
        status: WaybillStatus.NOT_ARRIVED,
      };
      const savedWaybill = await waybillRepo.save(waybillRepo.create(waybillData));

      // WaybillVin 快照
      const waybillVinDatas: Partial<WaybillVin>[] = vins.map((v) => ({
        waybillId: savedWaybill.id,
        vin: v.vin,
        model: v.model ?? undefined,
        color: v.color ?? undefined,
        vehicleType: v.vehicleType ?? undefined,
      }));
      await waybillVinRepo.save(waybillVinRepo.create(waybillVinDatas));

      // 标记 OrderVin.isAllocated
      for (const v of vins) v.isAllocated = true;
      await vinRepo.save(vins);

      // 释放 slot 不在这里做：车物理上还在场地，等启运扫码时才真离开
      void slotRepo;

      return savedWaybill;
    });
  }

}
