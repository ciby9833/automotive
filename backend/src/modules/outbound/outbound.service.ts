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
import { Driver } from '../carriers/entities/driver.entity';
import { Vehicle } from '../carriers/entities/vehicle.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { PartnerStatus } from '../../common/enums/partner-status.enum';
import {
  TransportType,
  VehicleTowType,
} from '../../common/enums/order-type.enum';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { WaybillStatus } from '../../common/enums/waybill-status.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { ImportOutboundOrderDto } from './dto/import-outbound-order.dto';
import { PlanWaybillDto } from './dto/plan-waybill.dto';
import {
  DEFAULT_PAGE_SIZE,
  EXPORT_MAX_ROWS,
  resolveSortColumn,
} from '../../common/dto/paginated.dto';

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
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerAddress)
    private readonly customerAddressRepo: Repository<CustomerAddress>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ============ 1. Excel 导入 ============
  // 一份 Excel = 一张出库订单 + N 条 VIN
  // 与入库不同：出库 VIN 必须已经在系统里 (客户不能凭空发一台我们没入过库的车)
  // 始发仓不再由用户选择：每台 VIN 的当前所在库位 = 权威始发仓，跨仓 Excel 自动聚合。
  async importOutboundOrder(
    dto: ImportOutboundOrderDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{
    orderId: string;
    orderCode: string;
    matched: number;
    missing: string[];
    alreadyBound: string[];
    alreadyAllocated: string[];
    originYards: Array<{
      yardId: string | null;
      yardName: string;
      yardCode: string | null;
      vinCount: number;
    }>;
  }> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权导入出库单');
    }
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    if (customer.status !== PartnerStatus.ACTIVE) {
      throw new BadRequestException('客户当前未开放新增业务');
    }

    // DealerCode 是客户地址簿的业务键。出库导入不接受自由文本门店名，
    // 也不生成临时代码；门店名称和地址统一来自客户主数据。
    const normalizedDealerCodes = Array.from(
      new Set(dto.vins.map((row) => row.dealerCode.trim().toUpperCase())),
    );
    if (normalizedDealerCodes.some((code) => !code)) {
      throw new BadRequestException('每一行 VIN 都必须填写 DealerCode');
    }
    const dealerAddresses = await this.customerAddressRepo
      .createQueryBuilder('address')
      .where('address.customer_id = :customerId', {
        customerId: dto.customerId,
      })
      .andWhere('address.isActive = true')
      .andWhere('UPPER(BTRIM(address.code)) IN (:...codes)', {
        codes: normalizedDealerCodes,
      })
      .getMany();
    const dealerByCode = new Map<string, CustomerAddress>();
    const duplicateDealerCodes = new Set<string>();
    for (const address of dealerAddresses) {
      const code = address.code?.trim().toUpperCase();
      if (!code) continue;
      if (dealerByCode.has(code)) duplicateDealerCodes.add(code);
      dealerByCode.set(code, address);
    }
    if (duplicateDealerCodes.size > 0) {
      throw new ConflictException(
        `客户地址簿存在重复门店编码，请先处理：${Array.from(duplicateDealerCodes).join(', ')}`,
      );
    }
    const unknownDealerCodes = normalizedDealerCodes.filter(
      (code) => !dealerByCode.has(code),
    );
    if (unknownDealerCodes.length > 0) {
      throw new BadRequestException(
        `以下 DealerCode 未在所选客户的启用地址簿中维护：${unknownDealerCodes.join(', ')}`,
      );
    }

    // 入参内自我去重
    const seen = new Set<string>();
    const uniqueVins = dto.vins.filter((v) => {
      if (seen.has(v.vin)) return false;
      seen.add(v.vin);
      return true;
    });

    // 出库 VIN 必须已存在系统 (入库过) 且属于同一客户；顺带把 slot.yard 拿上以推导始发仓
    const existing = await this.orderVinsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.order', 'origOrder')
      .leftJoinAndSelect('v.slot', 'slot')
      .leftJoinAndSelect('slot.yard', 'yard')
      .leftJoinAndSelect('slot.zone', 'zone')
      .where('v.vin IN (:...vins)', { vins: uniqueVins.map((r) => r.vin) })
      .getMany();
    const existingMap = new Map(existing.map((e) => [e.vin, e]));
    const missing: string[] = [];
    const alreadyBound: string[] = [];
    const alreadyAllocated: string[] = [];
    const outOfScope: string[] = []; // 跨机构：VIN 所属入库 org 不在当前用户 scope 内
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
      // 跨机构：VIN 的入库归属机构必须在当前用户 scope 内
      const vinOrgId = found.order?.organizationId;
      if (!vinOrgId || !scope.orgIds.includes(vinOrgId)) {
        outOfScope.push(row.vin);
        continue;
      }
      toUpdate.push({ vin: found, row });
    }

    if (toUpdate.length === 0) {
      const parts: string[] = [];
      if (missing.length > 0)
        parts.push(`未入库/客户不匹配 ${missing.length} 台`);
      if (outOfScope.length > 0)
        parts.push(`跨机构无权处理 ${outOfScope.length} 台`);
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

    // Order.organizationId：取任一匹配 VIN 的入库归属机构。
    // 前置的 scope 校验已经保证所有 VIN 落在 scope.orgIds 内，因此不会因单张出库单
    // 跨机构而无法定位归属；如果客户真的跨国下单，会在扫码时分拆为多个出库单。
    const orderOrgId = toUpdate[0].vin.order!.organizationId;

    // 按 slot.yard 聚合，未到仓 VIN (slot 为空) 汇总到"未到仓"桶
    const yardBucket = new Map<
      string,
      {
        yardId: string | null;
        yardName: string;
        yardCode: string | null;
        vinCount: number;
      }
    >();
    for (const { vin } of toUpdate) {
      const y = vin.slot?.yard;
      const key = y?.id ?? '__unarrived__';
      const entry = yardBucket.get(key);
      if (entry) {
        entry.vinCount += 1;
      } else {
        yardBucket.set(key, {
          yardId: y?.id ?? null,
          yardName: y?.name ?? '未到仓',
          yardCode: y?.code ?? null,
          vinCount: 1,
        });
      }
    }
    const originYards = Array.from(yardBucket.values());

    const result = await this.dataSource.transaction(async (mgr) => {
      const orderCode = `OUT-${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`;
      const orderRepo = mgr.getRepository(Order);
      const vinRepo = mgr.getRepository(OrderVin);

      // 出库单头 destinationYardId：只有全部 VIN 在同一仓时才写单一始发仓 (兼容旧展示)；
      // 跨仓场景保留 null，权威始发仓在 order_vins.slot.yard 上按 VIN 各自读。
      const singleYardId =
        originYards.length === 1 ? originYards[0].yardId : null;
      const orderData: Partial<Order> = {
        orderCode,
        customerOrderNo: dto.customerOrderNo,
        organizationId: orderOrgId,
        customerId: dto.customerId,
        transportType: TransportType.DELIVERY,
        destinationYardId: singleYardId,
        remark: dto.remark,
      };
      const savedOrder = await orderRepo.save(orderRepo.create(orderData));

      // 现有库存 VIN 是车型、颜色等车辆资料的唯一来源；导入只补充
      // dealer/towType/group + outboundOrderId，不接受 Excel 覆盖车辆主数据。
      // 不改 orderId（入库单追溯要保留）；outboundOrderId 是出库单的硬关联
      for (const { vin, row } of toUpdate) {
        const dealer = dealerByCode.get(row.dealerCode.trim().toUpperCase())!;
        vin.dealerCode = dealer.code!.trim();
        vin.dealerName = dealer.dealerName;
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
        originYards,
      };
    });

    // 订单级汇总
    await this.audit.log({
      operationType: OperationType.OUTBOUND_ORDER_IMPORT,
      orderId: result.orderId,
      operatorUserId,
      payload: {
        orderCode: result.orderCode,
        matched: result.matched,
        missingCount: missing.length,
        outOfScopeCount: outOfScope.length,
        alreadyBoundCount: alreadyBound.length,
        alreadyAllocatedCount: alreadyAllocated.length,
        originYards,
      },
    });
    // VIN 级节点：每台车都要在 timeline 上出现"进入出库单"事件；
    // dealerCode/dealerName 均是客户地址簿中的规范值。
    await this.audit.logMany(
      toUpdate.map(({ vin, row }) => ({
        operationType: OperationType.OUTBOUND_ORDER_IMPORT,
        orderId: result.orderId,
        vin: vin.vin,
        yardId: vin.slot?.yardId ?? null,
        slotId: vin.slotId ?? null,
        operatorUserId,
        payload: {
          orderCode: result.orderCode,
          dealerCode: vin.dealerCode,
          dealerName: vin.dealerName,
          towType: row.towType,
          groupCode: row.groupCode,
        },
      })),
    );
    // outOfScope 合并进 missing 交给前端展示（对操作员而言等价于"匹配不到"）
    return {
      ...result,
      missing: [...result.missing, ...outOfScope],
    };
  }

  // ============ 2. 出库订单列表 ============
  async listOutboundOrders(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      customerOrderNo?: string;
      organizationId?: string;
      status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      all?: boolean;
    },
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const sortColumn = resolveSortColumn(
      filters.sortBy,
      {
        orderCode: 'order.orderCode',
        customerOrderNo: 'order.customerOrderNo',
        createdAt: 'order.createdAt',
      },
      'order.createdAt',
    );
    const sortOrder: 'ASC' | 'DESC' =
      filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .leftJoinAndSelect('order.cancelledByUser', 'cancelledByUser')
      .where('order.transportType = :type', { type: TransportType.DELIVERY })
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('order.id', 'DESC');
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
      if (filters.status === 'PENDING') {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM order_vins pending_vin WHERE pending_vin.outbound_order_id = order.id AND pending_vin."isAllocated" = false)',
        );
      } else if (filters.status === 'COMPLETED') {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM order_vins any_vin WHERE any_vin.outbound_order_id = order.id)',
        ).andWhere(
          'NOT EXISTS (SELECT 1 FROM order_vins pending_vin WHERE pending_vin.outbound_order_id = order.id AND pending_vin."isAllocated" = false)',
        );
      }
    }
    if (filters.all) {
      const totalOnly = await qb.getCount();
      if (totalOnly > EXPORT_MAX_ROWS) {
        throw new BadRequestException(
          `导出结果 ${totalOnly} 条超过上限 ${EXPORT_MAX_ROWS}，请缩短时间范围或加过滤条件`,
        );
      }
    } else {
      qb.skip((page - 1) * pageSize).take(pageSize);
    }
    const [orders, total] = await qb.getManyAndCount();
    if (orders.length === 0) return { items: [], total, page, pageSize };

    // 一次聚合出所有出库单的仓分布，避免 N+1
    // 未到仓的 VIN (slot 为空) 单独归到 __unarrived__，前端按 null yardId 识别
    const orderIds = orders.map((o) => o.id);
    type YardRow = {
      outbound_order_id: string;
      yard_id: string | null;
      yard_name: string | null;
      yard_code: string | null;
      vin_count: string;
    };
    const yardRows = await this.orderVinsRepo
      .createQueryBuilder('v')
      .leftJoin('v.slot', 'slot')
      .leftJoin('slot.yard', 'yard')
      .select('v.outbound_order_id', 'outbound_order_id')
      .addSelect('yard.id', 'yard_id')
      .addSelect('yard.name', 'yard_name')
      .addSelect('yard.code', 'yard_code')
      .addSelect('COUNT(v.id)', 'vin_count')
      .where('v.outbound_order_id IN (:...ids)', { ids: orderIds })
      .groupBy('v.outbound_order_id')
      .addGroupBy('yard.id')
      .addGroupBy('yard.name')
      .addGroupBy('yard.code')
      .getRawMany<YardRow>();

    type VinCountRow = {
      outbound_order_id: string;
      total_count: string;
      allocated_count: string;
    };
    const vinCountRows = await this.orderVinsRepo
      .createQueryBuilder('v')
      .select('v.outbound_order_id', 'outbound_order_id')
      .addSelect('COUNT(v.id)', 'total_count')
      .addSelect(
        'COUNT(v.id) FILTER (WHERE v."isAllocated" = true)',
        'allocated_count',
      )
      .where('v.outbound_order_id IN (:...ids)', { ids: orderIds })
      .groupBy('v.outbound_order_id')
      .getRawMany<VinCountRow>();
    const vinCountsByOrder = new Map(
      vinCountRows.map((row) => [
        row.outbound_order_id,
        {
          totalVinCount: Number(row.total_count),
          allocatedVinCount: Number(row.allocated_count),
          pendingVinCount:
            Number(row.total_count) - Number(row.allocated_count),
        },
      ]),
    );

    type WaybillStatusRow = {
      order_id: string;
      total_count: string;
      in_transit_count: string;
      arrived_count: string;
    };
    const waybillStatusRows = await this.dataSource
      .getRepository(Waybill)
      .createQueryBuilder('waybill')
      .select('waybill.order_id', 'order_id')
      .addSelect('COUNT(waybill.id)', 'total_count')
      .addSelect(
        'COUNT(waybill.id) FILTER (WHERE waybill.status = :inTransit)',
        'in_transit_count',
      )
      .addSelect(
        'COUNT(waybill.id) FILTER (WHERE waybill.status = :arrived)',
        'arrived_count',
      )
      .where('waybill.order_id IN (:...ids)', { ids: orderIds })
      .setParameters({
        inTransit: WaybillStatus.IN_TRANSIT,
        arrived: WaybillStatus.ARRIVED,
      })
      .groupBy('waybill.order_id')
      .getRawMany<WaybillStatusRow>();
    const waybillStatusesByOrder = new Map(
      waybillStatusRows.map((row) => [
        row.order_id,
        {
          total: Number(row.total_count),
          inTransit: Number(row.in_transit_count),
          arrived: Number(row.arrived_count),
        },
      ]),
    );

    const yardsByOrder = new Map<
      string,
      Array<{
        yardId: string | null;
        yardName: string;
        yardCode: string | null;
        vinCount: number;
      }>
    >();
    for (const r of yardRows) {
      const list = yardsByOrder.get(r.outbound_order_id) ?? [];
      list.push({
        yardId: r.yard_id,
        yardName: r.yard_name ?? '未到仓',
        yardCode: r.yard_code,
        vinCount: Number(r.vin_count),
      });
      yardsByOrder.set(r.outbound_order_id, list);
    }

    const items = orders.map((o) => {
      const originYards = yardsByOrder.get(o.id) ?? [];
      const vinCounts = vinCountsByOrder.get(o.id) ?? {
        totalVinCount: 0,
        allocatedVinCount: 0,
        pendingVinCount: 0,
      };
      const waybillCounts = waybillStatusesByOrder.get(o.id) ?? {
        total: 0,
        inTransit: 0,
        arrived: 0,
      };
      const businessStatus =
        o.status === OrderStatus.CANCELLED
          ? 'CANCELLED'
          : vinCounts.totalVinCount === 0
            ? 'EMPTY'
            : vinCounts.allocatedVinCount === 0
              ? 'PENDING'
              : vinCounts.pendingVinCount > 0
                ? 'PARTIAL'
                : waybillCounts.inTransit > 0
                  ? 'IN_TRANSIT'
                  : waybillCounts.total > 0 &&
                      waybillCounts.arrived === waybillCounts.total
                    ? 'COMPLETED'
                    : 'PLANNED';
      const summary =
        originYards.length === 0
          ? '-'
          : originYards.length === 1
            ? originYards[0].yardName
            : `${originYards.length} 个场地`;
      return {
        id: o.id,
        orderCode: o.orderCode,
        customerOrderNo: o.customerOrderNo,
        customerId: o.customerId,
        customerName: o.customer?.name ?? '-',
        originYardName: o.destinationYard?.name ?? summary,
        originYardSummary: summary,
        originYards,
        organizationId: o.organizationId,
        organizationName: o.organization?.name ?? '-',
        createdAt: o.createdAt,
        status: o.status,
        cancelledAt: o.cancelledAt,
        cancelledByUserName: o.cancelledByUser?.displayName ?? null,
        ...vinCounts,
        businessStatus,
      };
    });
    return { items, total, page, pageSize };
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
      .leftJoinAndSelect('slot.zone', 'slotZone')
      .where('v.outbound_order_id = :oid', { oid: order.id })
      .orderBy('v.dealer_code', 'ASC')
      .addOrderBy('v.vin', 'ASC')
      .getMany();

    // 聚合始发仓分布：每台 VIN 的当前 slot.yard 才是权威始发仓
    const yardBucket = new Map<
      string,
      {
        yardId: string | null;
        yardName: string;
        yardCode: string | null;
        vinCount: number;
      }
    >();
    for (const v of vins) {
      const y = v.slot?.yard;
      const key = y?.id ?? '__unarrived__';
      const entry = yardBucket.get(key);
      if (entry) {
        entry.vinCount += 1;
      } else {
        yardBucket.set(key, {
          yardId: y?.id ?? null,
          yardName: y?.name ?? '未到仓',
          yardCode: y?.code ?? null,
          vinCount: 1,
        });
      }
    }
    const originYards = Array.from(yardBucket.values());

    return { order, vins, originYards };
  }

  // ============ 3. 全局待调度 VIN 池 ============
  // 出库订单只是筛选维度，不是查询前置条件。所有筛选都直接作用于当前账号
  // 权限范围内的待调度车辆行；开单时仍由选择兼容规则保证一单一订单/场地/门店。
  async listPlanPool(
    scope: EffectiveScope,
    filters: {
      organizationId?: string;
      customerId?: string;
      yardId?: string;
      dealerCode?: string;
      groupCode?: string;
      towType?: string;
      vin?: string;
      outboundOrderId?: string;
    },
  ): Promise<OrderVin[]> {
    if (scope.type !== 'ORG') return [];

    const qb = this.orderVinsRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.outboundOrder', 'outOrder')
      .innerJoinAndSelect('outOrder.customer', 'outCustomer')
      .innerJoinAndSelect('v.slot', 'slot')
      .leftJoinAndSelect('slot.yard', 'yard')
      .leftJoinAndSelect('slot.zone', 'zone')
      .where('outOrder.transportType = :delivery', {
        delivery: TransportType.DELIVERY,
      })
      .andWhere('outOrder.status = :activeOrder', {
        activeOrder: OrderStatus.ACTIVE,
      })
      .andWhere('v.arrival_status = :arrived', {
        arrived: OrderVinArrivalStatus.ARRIVED,
      })
      .andWhere('v."isAllocated" = false')
      .andWhere('v.dealer_code IS NOT NULL')
      .andWhere('slot.yard_id IS NOT NULL')
      .andWhere('outOrder.organizationId IN (:...__orgIds)', {
        __orgIds: scope.orgIds,
      })
      .orderBy('outOrder.createdAt', 'DESC')
      .addOrderBy('v.dealerCode', 'ASC')
      .addOrderBy('v.vin', 'ASC');

    if (filters.outboundOrderId) {
      qb.andWhere('v.outbound_order_id = :__boundOid', {
        __boundOid: filters.outboundOrderId,
      });
    }
    if (filters.organizationId) {
      qb.andWhere('outOrder.organizationId = :filterOrgId', {
        filterOrgId: filters.organizationId,
      });
    }
    if (filters.customerId) {
      qb.andWhere('outOrder.customerId = :cid', { cid: filters.customerId });
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
    if (filters.towType) {
      qb.andWhere('v.tow_type = :towType', { towType: filters.towType });
    }
    if (filters.vin?.trim()) {
      qb.andWhere('v.vin ILIKE :vin', { vin: `%${filters.vin.trim()}%` });
    }
    return qb.getMany();
  }

  // ============ 3b. 全局待调度异常池 ============
  async listPlanExceptions(
    scope: EffectiveScope,
    filters: {
      organizationId?: string;
      customerId?: string;
      yardId?: string;
      outboundOrderId?: string;
      vin?: string;
    },
  ): Promise<
    Array<{
      id: string;
      vin: string;
      outboundOrderId: string;
      outboundOrderCode: string;
      customerName: string;
      dealerCode: string | null;
      dealerName: string | null;
      reason: 'NOT_ARRIVED' | 'NO_SLOT' | 'MISSING_DEALER';
      slotCode: string | null;
      yardName: string | null;
    }>
  > {
    if (scope.type !== 'ORG') return [];

    const qb = this.orderVinsRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.outboundOrder', 'outOrder')
      .innerJoinAndSelect('outOrder.customer', 'outCustomer')
      .leftJoinAndSelect('v.slot', 'slot')
      .leftJoinAndSelect('slot.yard', 'yard')
      .leftJoinAndSelect('slot.zone', 'zone')
      .where('outOrder.transportType = :delivery', {
        delivery: TransportType.DELIVERY,
      })
      .andWhere('outOrder.status = :activeOrder', {
        activeOrder: OrderStatus.ACTIVE,
      })
      .andWhere('outOrder.organizationId IN (:...__orgIds)', {
        __orgIds: scope.orgIds,
      })
      .andWhere('v."isAllocated" = false')
      .andWhere(
        '(v.arrival_status != :arrived OR v.slot_id IS NULL OR v.dealer_code IS NULL)',
        { arrived: OrderVinArrivalStatus.ARRIVED },
      )
      .orderBy('v.vin', 'ASC');
    if (filters.organizationId) {
      qb.andWhere('outOrder.organizationId = :filterOrgId', {
        filterOrgId: filters.organizationId,
      });
    }
    if (filters.customerId) {
      qb.andWhere('outOrder.customerId = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.yardId) {
      qb.andWhere('slot.yard_id = :yardId', { yardId: filters.yardId });
    }
    if (filters.outboundOrderId) {
      qb.andWhere('v.outbound_order_id = :outboundOrderId', {
        outboundOrderId: filters.outboundOrderId,
      });
    }
    if (filters.vin?.trim()) {
      qb.andWhere('v.vin ILIKE :vin', { vin: `%${filters.vin.trim()}%` });
    }
    const vins = await qb.getMany();

    const blocked: Array<{
      id: string;
      vin: string;
      outboundOrderId: string;
      outboundOrderCode: string;
      customerName: string;
      dealerCode: string | null;
      dealerName: string | null;
      reason: 'NOT_ARRIVED' | 'NO_SLOT' | 'MISSING_DEALER';
      slotCode: string | null;
      yardName: string | null;
    }> = [];
    for (const v of vins) {
      let reason: 'NOT_ARRIVED' | 'NO_SLOT' | 'MISSING_DEALER' | null = null;
      if (v.arrivalStatus !== OrderVinArrivalStatus.ARRIVED)
        reason = 'NOT_ARRIVED';
      else if (!v.slotId || !v.slot?.yardId) reason = 'NO_SLOT';
      else if (!v.dealerCode) reason = 'MISSING_DEALER';
      if (!reason) continue;
      blocked.push({
        id: v.id,
        vin: v.vin,
        outboundOrderId: v.outboundOrderId!,
        outboundOrderCode: v.outboundOrder?.orderCode ?? '-',
        customerName: v.outboundOrder?.customer?.name ?? '-',
        dealerCode: v.dealerCode,
        dealerName: v.dealerName,
        reason,
        slotCode: v.slot?.zone
          ? `${v.slot.zone.code}-${String(v.slot.line).padStart(2, '0')}-${String(v.slot.row).padStart(2, '0')}`
          : null,
        yardName: v.slot?.yard?.name ?? null,
      });
    }
    return blocked;
  }

  // ============ 4. 开单：生成 Waybill ============
  // 强约束：以 outboundOrderId 为上下文，VIN 必须全部属于该出库单 +
  // 已到仓 + 未开单 + 有库位 + 同一仓 + 同一 dealerCode。
  // 始发仓从 VIN 当前 slot.yard 反推，客户端传的 originYardId 被忽略。
  async planWaybill(
    dto: PlanWaybillDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<Waybill> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('仅内部账号可开单');
    }

    // 出库单前置校验：存在 + 是 DELIVERY + 未取消 + 归属当前 scope
    const outOrder = await this.ordersRepo.findOne({
      where: {
        id: dto.outboundOrderId,
        transportType: TransportType.DELIVERY,
      },
    });
    if (!outOrder) throw new NotFoundException('出库订单不存在');
    if (outOrder.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('出库单已取消，不能开单');
    }
    this.scopeService.assertOrgWritable(scope, outOrder.organizationId);

    // 承运商：存在 + 启用
    const carrier = await this.carrierRepo.findOne({
      where: { id: dto.carrierId },
    });
    if (!carrier) throw new NotFoundException('承运商不存在');
    if (carrier.status !== PartnerStatus.ACTIVE) {
      throw new BadRequestException('承运商当前未开放新增业务，不能开单');
    }
    // 出库开单即形成可执行运输任务，司机与运输车辆都必须确定。
    const driver = await this.driverRepo.findOne({
      where: { id: dto.driverId },
    });
    if (!driver) throw new NotFoundException('司机不存在');
    if (!driver.isActive) throw new BadRequestException('司机已停用');
    if (driver.carrierId !== dto.carrierId) {
      throw new BadRequestException('司机不属于此承运商');
    }

    const vehicle = await this.vehicleRepo.findOne({
      where: { id: dto.vehicleId },
    });
    if (!vehicle) throw new NotFoundException('运输车辆不存在');
    if (!vehicle.isActive) throw new BadRequestException('运输车辆已停用');
    if (vehicle.carrierId !== dto.carrierId) {
      throw new BadRequestException('运输车辆不属于此承运商');
    }

    const { savedWaybill, plannedVins, derivedYard, destinationDealerCode } =
      await this.dataSource.transaction(async (mgr) => {
        const vinRepo = mgr.getRepository(OrderVin);
        const waybillRepo = mgr.getRepository(Waybill);
        const waybillVinRepo = mgr.getRepository(WaybillVin);
        const slotRepo = mgr.getRepository(YardSlot);

        // 锁行：并发开单同一 VIN 时让第二个事务在此等待
        const vins = await vinRepo
          .createQueryBuilder('v')
          .setLock('pessimistic_write', undefined, ['v'])
          .leftJoinAndSelect('v.slot', 'slot')
          .leftJoinAndSelect('slot.yard', 'slotYard')
          .leftJoinAndSelect('v.order', 'origOrder')
          .where('v.id IN (:...ids)', { ids: dto.orderVinIds })
          .getMany();

        if (vins.length !== dto.orderVinIds.length) {
          throw new BadRequestException('部分 VIN 不存在');
        }

        // 6 项刚性校验 + 一致性收口
        const yardIds = new Set<string>();
        const dealerCodes = new Set<string>();
        for (const v of vins) {
          // 1) 属于本次出库单
          if (v.outboundOrderId !== dto.outboundOrderId) {
            throw new BadRequestException(
              `VIN ${v.vin} 不属于本次出库单，请刷新后重选`,
            );
          }
          // 2) 已到仓
          if (v.arrivalStatus !== OrderVinArrivalStatus.ARRIVED) {
            throw new BadRequestException(`VIN ${v.vin} 未到仓，不能开单`);
          }
          // 3) 未开单
          if (v.isAllocated) {
            throw new ConflictException(`VIN ${v.vin} 已被开单，请刷新页面`);
          }
          // 4) 有库位（即有始发仓事实）
          if (!v.slotId || !v.slot?.yardId) {
            throw new BadRequestException(
              `VIN ${v.vin} 无当前库位，无法确定始发仓`,
            );
          }
          // 5) org 在 scope 内（防越权）
          const orgId = v.slot.yard?.organizationId ?? v.order?.organizationId;
          if (!orgId || !scope.orgIds.includes(orgId)) {
            throw new ForbiddenException(`VIN ${v.vin} 跨机构无权开单`);
          }
          // 6) 有 dealerCode（出库单导入时应已写入；缺失即数据异常）
          if (!v.dealerCode) {
            throw new BadRequestException(
              `VIN ${v.vin} 缺经销商编码，请先补 dealerCode 再开单`,
            );
          }
          yardIds.add(v.slot.yardId);
          dealerCodes.add(v.dealerCode);
        }

        // 一致性收口：同一 waybill 只允许同仓 + 同经销商
        if (yardIds.size > 1) {
          throw new BadRequestException(
            `一张运单只能来自同一始发仓，当前选中 ${yardIds.size} 个仓，请按仓筛选后分单`,
          );
        }
        if (dealerCodes.size > 1) {
          throw new BadRequestException(
            `一张运单只能派往同一经销店，当前选中 ${dealerCodes.size} 个 dealerCode，请按经销商筛选后分单`,
          );
        }

        // 运输方式默认继承 VIN 导入值；若所选 VIN 本身不一致，则必须在开单时明确覆盖。
        const vinTowTypes = new Set(
          vins
            .map((v) => v.towType)
            .filter((value): value is VehicleTowType => !!value),
        );
        const effectiveTowType =
          dto.towType ?? (vinTowTypes.size === 1 ? [...vinTowTypes][0] : null);
        if (!effectiveTowType) {
          throw new BadRequestException(
            vinTowTypes.size > 1
              ? '所选 VIN 的运输方式不一致，请在开单时确认本运单运输方式'
              : '所选 VIN 未维护运输方式，请在开单时选择运输方式',
          );
        }

        // 始发仓反推：以 VIN 库位事实为准，忽略客户端传值
        const derivedYardId = [...yardIds][0];
        const derivedYard = await mgr
          .getRepository(Yard)
          .findOne({ where: { id: derivedYardId } });
        if (!derivedYard) {
          // slot.yardId 有 FK 保证，理论上不会走到这里；防御性处理
          throw new NotFoundException('始发仓数据缺失');
        }
        // 组织归属再次校验（VIN 已过 scope，但仓归属仍需与出库单匹配以保证账目一致）
        if (derivedYard.organizationId !== outOrder.organizationId) {
          throw new BadRequestException(
            '始发仓与出库单归属机构不一致，请重新导入或联系管理员',
          );
        }

        // 目的门店：优先前端手选 (destinationDealerId)，其次按 dealer_code 自动匹配
        const dealerCode = vins[0].dealerCode;
        // 目的门店属于出库订单客户；开单允许最终确认并覆盖导入 DealerCode。
        const customerId = outOrder.customerId;
        let destDealer: CustomerAddress | null = null;
        if (dto.destinationDealerId) {
          if (!customerId) {
            throw new BadRequestException('无法解析出库 VIN 的所属客户');
          }
          destDealer = await mgr.getRepository(CustomerAddress).findOne({
            where: {
              id: dto.destinationDealerId,
              customerId,
              isActive: true,
            },
          });
          if (!destDealer) {
            throw new NotFoundException(
              '指定的目的门店不存在、已停用或不属于当前客户',
            );
          }
        } else if (dealerCode && customerId) {
          destDealer = await mgr.getRepository(CustomerAddress).findOne({
            where: { customerId, code: dealerCode, isActive: true },
          });
        }
        if (!destDealer) {
          throw new BadRequestException(
            '目的门店未在当前客户的启用地址簿中，请先维护 DealerCode 后再开单',
          );
        }

        // 建 Waybill
        const waybillCode = `WB${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`;
        const waybillData: Partial<Waybill> = {
          waybillCode,
          organizationId: derivedYard.organizationId,
          customerWaybillCode: dto.customerWaybillCode ?? undefined,
          transportType: TransportType.DELIVERY,
          orderId: outOrder.id,
          originYardId: derivedYard.id,
          originText: derivedYard.name,
          destinationYardId: null,
          destinationDealerId: destDealer?.id ?? null,
          carrierId: dto.carrierId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          towType: effectiveTowType,
          recipientName: dto.recipientName ?? destDealer?.contactName ?? null,
          recipientPhone:
            dto.recipientPhone ?? destDealer?.contactPhone ?? null,
          remark: dto.remark ?? undefined,
          status: WaybillStatus.NOT_ARRIVED,
        };
        const savedWaybill = await waybillRepo.save(
          waybillRepo.create(waybillData),
        );

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

        return {
          savedWaybill,
          plannedVins: vins,
          derivedYard,
          destinationDealerCode: destDealer.code,
        };
      });

    // 事务外为每台车打一条审计日志，追溯时按 vin 也能查到"开单事件"
    for (const v of plannedVins) {
      await this.audit.log({
        operationType: OperationType.WAYBILL_PLAN,
        orderId: v.outboundOrderId ?? null,
        vin: v.vin,
        waybillId: savedWaybill.id,
        yardId: derivedYard.id,
        slotId: v.slotId ?? null,
        operatorUserId,
        payload: {
          waybillCode: savedWaybill.waybillCode,
          carrierId: dto.carrierId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          importedDealerCode: v.dealerCode,
          destinationDealerId: savedWaybill.destinationDealerId,
          destinationDealerCode,
          destinationOverridden: v.dealerCode !== destinationDealerCode,
          importedTowType: v.towType,
          effectiveTowType: savedWaybill.towType,
          towTypeOverridden: v.towType !== savedWaybill.towType,
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
