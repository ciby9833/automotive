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
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { TransportType } from '../../common/enums/order-type.enum';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { WaybillStatus } from '../../common/enums/waybill-status.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';
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
    private readonly audit: AuditService,
  ) {}

  // ============ 1. Excel 导入 ============
  // 一份 Excel = 一张出库订单 + N 条 VIN
  // 与入库不同：出库 VIN 必须已经在系统里 (客户不能凭空发一台我们没入过库的车)
  async importOutboundOrder(
    dto: ImportOutboundOrderDto,
    scope: EffectiveScope,
    operatorUserId?: string,
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
    const alreadyBound: string[] = []; // 已绑定别的出库单未开单
    const alreadyAllocated: string[] = []; // 已被某张 waybill 选走
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
      // 已被开成运单 → 不能重导（这单已经进入运输流程）
      if (found.isAllocated) {
        alreadyAllocated.push(row.vin);
        continue;
      }
      // 已绑定别的出库单（未开单）→ 拒绝，让用户先取消/修订旧单再重导，防止静默覆盖
      if (found.outboundOrderId) {
        alreadyBound.push(row.vin);
        continue;
      }
      toUpdate.push({ vin: found, row });
    }

    if (toUpdate.length === 0) {
      const parts: string[] = [];
      if (missing.length > 0)
        parts.push(`未入库/客户不匹配 ${missing.length} 台`);
      if (alreadyBound.length > 0)
        parts.push(
          `已绑定其他出库单 ${alreadyBound.length} 台 (${alreadyBound.slice(0, 3).join(',')}${alreadyBound.length > 3 ? '...' : ''})`,
        );
      if (alreadyAllocated.length > 0)
        parts.push(`已开单/运输中 ${alreadyAllocated.length} 台`);
      throw new BadRequestException(
        `导入的 ${uniqueVins.length} 个 VIN 全部无法入单：${parts.join('；') || '无有效原因'}`,
      );
    }

    const result = await this.dataSource.transaction(async (mgr) => {
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

      // 现有 OrderVin 上打上出库属性 (dealer/towType/group + outboundOrderId FK)
      // 不改 orderId（入库单追溯要保留）；outboundOrderId 是出库单的硬关联
      for (const { vin, row } of toUpdate) {
        vin.dealerCode = row.dealerCode ?? null;
        vin.dealerName = row.dealerName ?? null;
        vin.towType = row.towType ?? null;
        vin.groupCode = row.groupCode ?? null;
        vin.outboundOrderId = savedOrder.id;
      }
      await vinRepo.save(toUpdate.map((x) => x.vin));

      return {
        orderId: savedOrder.id,
        orderCode: savedOrder.orderCode,
        matched: toUpdate.length,
        missing,
        alreadyBound,
        alreadyAllocated,
      };
    });

    await this.audit.log({
      operationType: OperationType.OUTBOUND_ORDER_IMPORT,
      orderId: result.orderId,
      operatorUserId,
      payload: {
        orderCode: result.orderCode,
        matched: result.matched,
        missingCount: missing.length,
        alreadyBoundCount: alreadyBound.length,
        alreadyAllocatedCount: alreadyAllocated.length,
      },
    });
    return result;
  }

  // ============ 2. 出库订单列表 ============
  async listOutboundOrders(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      customerOrderNo?: string;
      organizationId?: string;
      status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
    },
  ) {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .leftJoinAndSelect('order.cancelledByUser', 'cancelledByUser')
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
    // 默认排除 CANCELLED；status=CANCELLED 时只查已取消，同入库列表逻辑
    if (filters.status === 'CANCELLED') {
      qb.andWhere('order.status = :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      });
    } else {
      qb.andWhere('order.status = :active', { active: OrderStatus.ACTIVE });
    }
    const orders = await qb.getMany();
    if (orders.length === 0) return [];

    return orders.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      customerOrderNo: o.customerOrderNo,
      customerName: o.customer?.name ?? '-',
      originYardName: o.destinationYard?.name ?? '-',
      organizationId: o.organizationId,
      organizationName: o.organization?.name ?? '-',
      createdAt: o.createdAt,
      status: o.status,
      cancelledAt: o.cancelledAt,
      cancelledByUserName: o.cancelledByUser?.displayName ?? null,
    }));
  }

  async getOutboundOrderDetail(id: string, scope: EffectiveScope) {
    // 返回订单头 + 关联的 VIN 列表
    // OrderVin 与出库订单是软关联：通过 (customerId + customerOrderNo + dealer_code)
    // 因为 OrderVin.orderId 指的是入库订单，出库单不重建 VIN 记录
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .leftJoinAndSelect('order.cancelledByUser', 'cancelledByUser')
      .where('order.id = :id', { id })
      .andWhere('order.transportType = :type', {
        type: TransportType.DELIVERY,
      });
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
    });
    const order = await qb.getOne();
    if (!order) throw new NotFoundException('出库订单不存在');

    // 关联 VIN：走 outbound_order_id FK，硬关联可靠
    const vins = await this.orderVinsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.order', 'origOrder')
      .leftJoinAndSelect('v.slot', 'slot')
      .leftJoinAndSelect('slot.yard', 'slotYard')
      .where('v.outbound_order_id = :oid', { oid: order.id })
      .orderBy('v.dealer_code', 'ASC')
      .addOrderBy('v.vin', 'ASC')
      .getMany();
    return { order, vins };
  }

  // ============ 3. 可用于开单的 VIN 池 ============
  // 库存中已到仓 + 未分配 + 属于本客户的 VIN
  // outboundOrderId 有值时，只显示该出库订单关联的 VIN (软关联 customerOrderNo)
  async listAvailableVinsForPlan(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      yardId?: string;
      dealerCode?: string;
      groupCode?: string;
      outboundOrderId?: string;
    },
  ): Promise<OrderVin[]> {
    // 校验 outbound 订单存在（如果传了）；实际过滤走 outbound_order_id FK
    if (filters.outboundOrderId) {
      const outOrder = await this.ordersRepo.findOne({
        where: {
          id: filters.outboundOrderId,
          transportType: TransportType.DELIVERY,
        },
      });
      if (!outOrder) throw new NotFoundException('出库订单不存在');
    }

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

    // 按出库订单硬关联：走 FK，其他 filter 忽略冲突
    if (filters.outboundOrderId) {
      qb.andWhere('v.outbound_order_id = :__boundOid', {
        __boundOid: filters.outboundOrderId,
      });
    }

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
  async planWaybill(
    dto: PlanWaybillDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<Waybill> {
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

    const { savedWaybill, plannedVins } = await this.dataSource.transaction(async (mgr) => {
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

      // 目的门店：优先前端手选 (destinationDealerId)，其次按 dealer_code 自动匹配
      // 都空则不绑，业务员靠 recipient_name / recipient_phone 手填补救
      const dealerCode = vins[0].dealerCode;
      const customerId = vins[0].order?.customerId;
      let destDealer: CustomerAddress | null = null;
      if (dto.destinationDealerId) {
        destDealer = await mgr.getRepository(CustomerAddress).findOne({
          where: { id: dto.destinationDealerId },
        });
        if (!destDealer) throw new NotFoundException('指定的目的门店不存在');
      } else if (dealerCode && customerId) {
        destDealer = await mgr.getRepository(CustomerAddress).findOne({
          where: { customerId, code: dealerCode },
        });
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
        destinationDealerId: destDealer?.id ?? null,
        carrierId: dto.carrierId,
        driverId: dto.driverId ?? null,
        vehicleId: dto.vehicleId ?? null,
        towType: dto.towType ?? null,
        // 收件人：优先前端手填，其次门店联系人兜底 (方便签收电话联络)
        recipientName: dto.recipientName ?? destDealer?.contactName ?? null,
        recipientPhone: dto.recipientPhone ?? destDealer?.contactPhone ?? null,
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

      return { savedWaybill, plannedVins: vins };
    });

    // 事务外为每台车打一条审计日志，追溯时按 vin 也能查到"开单事件"
    for (const v of plannedVins) {
      await this.audit.log({
        operationType: OperationType.WAYBILL_PLAN,
        orderId: v.outboundOrderId ?? null,
        vin: v.vin,
        operatorUserId,
        payload: {
          waybillId: savedWaybill.id,
          waybillCode: savedWaybill.waybillCode,
          carrierId: dto.carrierId,
        },
      });
    }
    return savedWaybill;
  }

  // ============ 4. 出库订单软取消 ============
  // 只允许 ACTIVE 且未开单的出库单取消。
  // 保留 Order 壳 + Order status=CANCELLED + 释放 VIN 出库属性 (isAllocated=false, outboundOrderId=null)
  // 审计日志里 snapshot 保留 VIN 列表方便追溯
  async cancelOutboundOrder(
    orderId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId, transportType: TransportType.DELIVERY },
    });
    if (!order) throw new NotFoundException('出库订单不存在');
    if (scope.type === 'ORG' && !scope.orgIds.includes(order.organizationId)) {
      throw new ForbiddenException('无权取消此出库订单');
    }
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('仅内部账号可取消出库单');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('出库单已取消');
    }

    // 已开成运单的 VIN 阻塞：先撤运单
    const boundVins = await this.orderVinsRepo.find({
      where: { outboundOrderId: orderId },
    });
    const inWaybill = boundVins.filter((v) => v.isAllocated);
    if (inWaybill.length > 0) {
      throw new BadRequestException(
        `订单里有 ${inWaybill.length} 台车已开成运单，请先撤销运单 (${inWaybill
          .slice(0, 3)
          .map((v) => v.vin)
          .join(', ')}${inWaybill.length > 3 ? '…' : ''})`,
      );
    }

    const vinSnapshot = boundVins.map((v) => ({
      vin: v.vin,
      brand: v.brand,
      model: v.model,
      color: v.color,
      dealerCode: v.dealerCode,
      dealerName: v.dealerName,
    }));

    const now = new Date();
    await this.dataSource.transaction(async (mgr) => {
      // VIN 释放出库属性 (回到"未分配"池)。dealer/tow/group 保留以备重新导入时参考
      await mgr
        .getRepository(OrderVin)
        .createQueryBuilder()
        .update()
        .set({ outboundOrderId: null, isAllocated: false })
        .where('outbound_order_id = :orderId', { orderId })
        .execute();
      await mgr.getRepository(Order).update(order.id, {
        status: OrderStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: operatorUserId,
      });
    });

    await this.audit.log({
      operationType: OperationType.OUTBOUND_ORDER_CANCEL,
      orderId,
      operatorUserId,
      payload: {
        orderCode: order.orderCode,
        vinCount: boundVins.length,
        vinSnapshot,
      },
    });
  }
}
