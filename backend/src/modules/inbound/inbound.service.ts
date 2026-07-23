import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Order } from '../orders/entities/order.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { InboundBatch } from './entities/inbound-batch.entity';
import { Yard } from '../yards/entities/yard.entity';
import {
  YardSlot,
  YardSlotStatus,
} from '../yards/entities/yard-slot.entity';
import { TransportType } from '../../common/enums/order-type.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { OrderPickupStatus } from '../../common/enums/order-pickup-status.enum';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ImportInboundOrderDto,
  ImportInboundVinRow,
} from './dto/import-inbound-order.dto';
import { RegisterUnexpectedVinDto } from './dto/register-unexpected-vin.dto';
import { AssignPickupDto } from './dto/assign-pickup.dto';
import { PickupOrderScanDto } from './dto/pickup-order-scan.dto';
import { Carrier } from '../carriers/entities/carrier.entity';
import { User } from '../users/entities/user.entity';
import { PickupScanDto } from './dto/pickup-scan.dto';
import { InboundScanDto, CreateInboundBatchDto } from './dto/inbound-scan.dto';

// 极兔入库流程后端服务：Excel 导入 → 提货扫描 → 到仓入库扫描
@Injectable()
export class InboundService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderVin)
    private readonly orderVinsRepo: Repository<OrderVin>,
    @InjectRepository(InboundBatch)
    private readonly batchRepo: Repository<InboundBatch>,
    @InjectRepository(Yard)
    private readonly yardRepo: Repository<Yard>,
    @InjectRepository(YardSlot)
    private readonly slotRepo: Repository<YardSlot>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ============ Excel 导入 ============
  // 一份 Excel = 一张入库订单 + N 条 VIN；VIN 全局去重(跨订单)
  async importInboundOrder(
    dto: ImportInboundOrderDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{ orderId: string; orderCode: string; created: number; skipped: number }> {
    // 目的仓必须在 scope 里
    const yard = await this.yardRepo.findOne({
      where: { id: dto.destinationYardId },
    });
    if (!yard) throw new NotFoundException('目的仓不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);

    // 入参内先自我去重
    const seen = new Set<string>();
    const uniqueVins = dto.vins.filter((v) => {
      if (seen.has(v.vin)) return false;
      seen.add(v.vin);
      return true;
    });

    // 查系统里已存在的 VIN(可能之前的订单已经登记过，同一 VIN 不能重复入库)
    const existing = await this.orderVinsRepo.find({
      where: { vin: In(uniqueVins.map((v) => v.vin)) },
      select: { vin: true },
    });
    const existingSet = new Set(existing.map((e) => e.vin));
    const toInsert = uniqueVins.filter((v) => !existingSet.has(v.vin));

    if (toInsert.length === 0) {
      throw new ConflictException(
        '导入的 VIN 全部已在系统中，无需重复导入',
      );
    }

    const result = await this.dataSource.transaction(async (mgr) => {
      const orderCode = `IN-${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`;
      const orderRepo = mgr.getRepository(Order);
      const vinRepo = mgr.getRepository(OrderVin);
      // 用 Partial<Entity> 明确单对象类型，避免 TS 在 overload resolution 里把 create() 认成数组重载
      const orderData: Partial<Order> = {
        orderCode,
        customerOrderNo: dto.customerOrderNo,
        organizationId: yard.organizationId,
        customerId: dto.customerId,
        transportType: TransportType.TRANSFER,
        originText: dto.originText,
        destinationYardId: dto.destinationYardId,
        expectedArrivalDate: dto.expectedArrivalDate,
        remark: dto.remark,
      };
      const savedOrder = await orderRepo.save(orderRepo.create(orderData));

      const vinDatas: Partial<OrderVin>[] = toInsert.map((v) => ({
        orderId: savedOrder.id,
        vin: v.vin,
        brand: v.brand,
        model: v.model,
        color: v.color,
        vehicleType: v.vehicleType,
        motorNo: v.motorNo,
        arrivalStatus: OrderVinArrivalStatus.EXPECTED,
      }));
      const vinEntities = vinRepo.create(vinDatas);
      await vinRepo.save(vinEntities);

      return {
        orderId: savedOrder.id,
        orderCode: savedOrder.orderCode,
        created: vinEntities.length,
        skipped: uniqueVins.length - vinEntities.length,
      };
    });

    await this.audit.log({
      operationType: OperationType.INBOUND_ORDER_IMPORT,
      orderId: result.orderId,
      operatorUserId,
      payload: {
        orderCode: result.orderCode,
        created: result.created,
        skipped: result.skipped,
        customerId: dto.customerId,
        destinationYardId: dto.destinationYardId,
      },
    });
    return result;
  }

  // ============ 入库订单列表/详情 ============
  async listInboundOrders(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      destinationYardId?: string;
      customerOrderNo?: string;
      organizationId?: string;
      status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
    },
  ): Promise<
    Array<{
      id: string;
      orderCode: string;
      customerOrderNo: string | null;
      customerName: string;
      destinationYardName: string;
      organizationId: string;
      organizationName: string;
      expectedArrivalDate: string | null;
      total: number;
      arrived: number;
      pickedUp: number;
      createdAt: Date;
      status: OrderStatus;
      cancelledAt: Date | null;
      cancelledByUserName: string | null;
    }>
  > {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .leftJoinAndSelect('order.cancelledByUser', 'cancelledByUser')
      .where('order.transportType = :type', { type: TransportType.TRANSFER })
      .orderBy('order.createdAt', 'DESC');
    // 默认排除 CANCELLED；status=CANCELLED 时只查 CANCELLED
    if (filters.status === 'CANCELLED') {
      qb.andWhere('order.status = :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      });
    } else {
      qb.andWhere('order.status = :active', { active: OrderStatus.ACTIVE });
    }
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
      narrowToOrgId: filters.organizationId,
    });
    if (filters.customerId) {
      qb.andWhere('order.customerId = :cid', { cid: filters.customerId });
    }
    if (filters.destinationYardId) {
      qb.andWhere('order.destinationYardId = :yid', {
        yid: filters.destinationYardId,
      });
    }
    if (filters.customerOrderNo) {
      qb.andWhere('order.customerOrderNo ILIKE :cno', {
        cno: `%${filters.customerOrderNo}%`,
      });
    }
    const orders = await qb.getMany();
    if (orders.length === 0) return [];

    // 统计每单已到货/已提货 VIN 数
    const counts = await this.orderVinsRepo
      .createQueryBuilder('v')
      .select('v.order_id', 'orderId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE v.arrival_status = '${OrderVinArrivalStatus.ARRIVED}')`,
        'arrived',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE v.picked_up_at IS NOT NULL)',
        'pickedUp',
      )
      .where('v.order_id IN (:...ids)', { ids: orders.map((o) => o.id) })
      .groupBy('v.order_id')
      .getRawMany<{
        orderId: string;
        total: string;
        arrived: string;
        pickedUp: string;
      }>();
    const countMap = new Map(
      counts.map((c) => [c.orderId, {
        total: Number(c.total),
        arrived: Number(c.arrived),
        pickedUp: Number(c.pickedUp),
      }]),
    );

    return orders
      .map((o) => {
        const c = countMap.get(o.id) ?? { total: 0, arrived: 0, pickedUp: 0 };
        if (filters.status === 'PENDING' && c.total > 0 && c.arrived === c.total) return null;
        if (filters.status === 'COMPLETED' && c.arrived !== c.total) return null;
        return {
          id: o.id,
          orderCode: o.orderCode,
          customerOrderNo: o.customerOrderNo,
          customerName: o.customer?.name ?? '-',
          destinationYardName: o.destinationYard?.name ?? '-',
          organizationId: o.organizationId,
          organizationName: o.organization?.name ?? '-',
          expectedArrivalDate: o.expectedArrivalDate,
          total: c.total,
          arrived: c.arrived,
          pickedUp: c.pickedUp,
          createdAt: o.createdAt,
          status: o.status,
          cancelledAt: o.cancelledAt,
          cancelledByUserName: o.cancelledByUser?.displayName ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  async getInboundOrderDetail(
    id: string,
    scope: EffectiveScope,
    filters?: { keyword?: string; status?: OrderVinArrivalStatus },
  ) {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .leftJoinAndSelect('order.cancelledByUser', 'cancelledByUser')
      .where('order.id = :id', { id })
      .andWhere('order.transportType = :type', {
        type: TransportType.TRANSFER,
      });
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
    });
    const order = await qb.getOne();
    if (!order) throw new NotFoundException('入库订单不存在');

    // VIN 列表查询：走 QueryBuilder 支持 ilike 关键字过滤 + 状态过滤 + 关联加载
    // 关键字匹配 vin / brand / model / color / motorNo / dealerCode / dealerName
    const vinQb = this.orderVinsRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.pickupCarrier', 'pickupCarrier')
      .leftJoinAndSelect('v.pickupDriverUser', 'pickupDriverUser')
      .leftJoinAndSelect('v.arrivedByUser', 'arrivedByUser')
      .leftJoinAndSelect('v.cancelledByUser', 'cancelledByUser')
      .leftJoinAndSelect('v.slot', 'slot')
      .leftJoinAndSelect('slot.yard', 'slotYard')
      .leftJoinAndSelect('v.inboundBatch', 'inboundBatch')
      .where('v.orderId = :id', { id })
      .orderBy('v.vin', 'ASC');

    if (filters?.status) {
      vinQb.andWhere('v.arrivalStatus = :status', { status: filters.status });
    }
    const kw = filters?.keyword?.trim();
    if (kw) {
      vinQb.andWhere(
        `(v.vin ILIKE :kw OR v.brand ILIKE :kw OR v.model ILIKE :kw OR v.color ILIKE :kw OR v."motor_no" ILIKE :kw OR v."dealer_code" ILIKE :kw OR v."dealer_name" ILIKE :kw)`,
        { kw: `%${kw}%` },
      );
    }
    const vins = await vinQb.getMany();

    // 概览统计走原始订单口径 (不受 keyword/status 过滤影响)，用一次聚合查询
    const totalsRow = await this.orderVinsRepo
      .createQueryBuilder('v')
      .select('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE v.arrival_status = '${OrderVinArrivalStatus.ARRIVED}')::int`,
        'arrived',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE v.picked_up_at IS NOT NULL)::int`,
        'pickedUp',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE v.arrival_status = '${OrderVinArrivalStatus.CANCELLED}')::int`,
        'cancelled',
      )
      .where('v.orderId = :id', { id })
      .getRawOne<{ total: number; arrived: number; pickedUp: number; cancelled: number }>();
    const totals = totalsRow ?? { total: 0, arrived: 0, pickedUp: 0, cancelled: 0 };

    return { order, vins, totals };
  }

  // ============ 提货扫描 (供应商司机) ============
  async pickupScan(dto: PickupScanDto, user: AuthenticatedUser): Promise<OrderVin> {
    if (user.role !== Role.CARRIER_DRIVER && user.role !== Role.CARRIER_STAFF) {
      throw new ForbiddenException('只有供应商司机/业务员可执行提货扫描');
    }
    if (!user.carrierId) {
      throw new ForbiddenException('账号未绑定承运商');
    }
    const vin = await this.orderVinsRepo.findOne({
      where: { vin: dto.vin },
      relations: { order: true },
    });
    if (!vin) throw new NotFoundException('系统里未找到此 VIN，请确认是否已导入订单');
    if (vin.pickedUpAt) {
      throw new BadRequestException(
        `此 VIN 已于 ${vin.pickedUpAt.toISOString()} 被提货过`,
      );
    }
    if (vin.arrivalStatus === OrderVinArrivalStatus.ARRIVED) {
      throw new BadRequestException('此 VIN 已到仓入库，无法再提货');
    }
    vin.pickupCarrierId = user.carrierId;
    vin.pickupDriverUserId = user.userId;
    vin.pickedUpAt = new Date();
    vin.pickupLocation = dto.location ?? vin.order?.originText ?? null;
    vin.pickupPhotoUrls = dto.photoUrls ?? null;
    vin.pickupRemark = dto.remark ?? null;
    const saved = await this.orderVinsRepo.save(vin);
    await this.audit.log({
      operationType: OperationType.PICKUP_SCAN,
      orderId: vin.orderId,
      vin: vin.vin,
      operatorUserId: user.userId,
      payload: {
        location: vin.pickupLocation,
        carrierId: user.carrierId,
        photoKeys: dto.photoUrls ?? null,
        remark: dto.remark ?? null,
      },
    });
    return saved;
  }

  // ============ 自动分配：在 zone 内挑最优空位 ============
  // 规则：同 model+color 相邻优先（同型号同色车尽量停一起，便于装车集中）
  //      找不到相邻则按 slotNo 升序取第一个空位
  //      slotNo 保持前导零对齐 (如 '01' 相邻是 '02'，不是 '2')
  private async pickAutoSlot(
    mgr: EntityManager,
    opts: {
      yardId: string | undefined;
      zoneCode: string;
      preferModel: string | null;
      preferColor: string | null;
    },
  ): Promise<YardSlot | null> {
    const slotRepo = mgr.getRepository(YardSlot);

    const vacantQb = slotRepo
      .createQueryBuilder('s')
      .where('s.status = :vacant', { vacant: YardSlotStatus.VACANT })
      .andWhere('s."isLocked" = false')
      .andWhere('s.code LIKE :prefix', { prefix: `${opts.zoneCode}-%` })
      .orderBy('s."slotNo"', 'ASC');
    if (opts.yardId) {
      vacantQb.andWhere('s.yard_id = :yid', { yid: opts.yardId });
    }
    const vacantSlots = await vacantQb.getMany();
    if (vacantSlots.length === 0) return null;

    // 无偏好 → 直接第一个
    if (!opts.preferModel && !opts.preferColor) return vacantSlots[0];

    // 找同型号+同色的已占用位（通过 slot.currentVin 关联到 order_vin）
    const sameStyleQb = slotRepo
      .createQueryBuilder('s')
      .innerJoin(OrderVin, 'ov', 'ov.vin = s."currentVin"')
      .where('s.status = :occupied', { occupied: YardSlotStatus.OCCUPIED })
      .andWhere('s.code LIKE :prefix', { prefix: `${opts.zoneCode}-%` });
    if (opts.yardId) {
      sameStyleQb.andWhere('s.yard_id = :yid', { yid: opts.yardId });
    }
    if (opts.preferModel) {
      sameStyleQb.andWhere('ov.model = :m', { m: opts.preferModel });
    }
    if (opts.preferColor) {
      sameStyleQb.andWhere('ov.color = :c', { c: opts.preferColor });
    }
    const sameStyleSlots = await sameStyleQb.getMany();
    if (sameStyleSlots.length === 0) return vacantSlots[0];

    // 相邻优先：slotNo 前后各 1，命中就返回
    const vacantByNo = new Map(vacantSlots.map((s) => [s.slotNo, s]));
    for (const occ of sameStyleSlots) {
      if (!occ.slotNo) continue;
      const num = parseInt(occ.slotNo, 10);
      if (isNaN(num)) continue;
      const width = occ.slotNo.length;
      const next = String(num + 1).padStart(width, '0');
      const prev = String(num - 1).padStart(width, '0');
      if (vacantByNo.has(next)) return vacantByNo.get(next)!;
      if (vacantByNo.has(prev)) return vacantByNo.get(prev)!;
    }
    return vacantSlots[0];
  }

  // ============ 入库扫描 (场地业务员) ============
  async inboundScan(dto: InboundScanDto, user: AuthenticatedUser): Promise<OrderVin> {
    const scope = await this.scopeService.resolve(user);
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('入库扫描仅内部场地业务员可执行');
    }

    const saved = await this.dataSource.transaction(async (mgr) => {
      const vin = await mgr.findOne(OrderVin, {
        where: { vin: dto.vin },
        relations: { order: true },
      });
      if (!vin)
        throw new NotFoundException('系统里未找到此 VIN，请确认是否已导入订单');
      if (vin.arrivalStatus === OrderVinArrivalStatus.ARRIVED) {
        throw new BadRequestException(
          `此 VIN 已到仓 (库位 ${vin.slotId ?? '?'})，无法重复入库`,
        );
      }

      // 目的仓必须在 scope 内
      if (vin.order?.destinationYardId) {
        if (
          scope.role === Role.YARD_STAFF &&
          scope.scopeYardId &&
          vin.order.destinationYardId !== scope.scopeYardId
        ) {
          throw new ForbiddenException(
            '此 VIN 目的仓与您所在场地不匹配',
          );
        }
        if (!scope.orgIds.includes(vin.order.organizationId)) {
          throw new ForbiddenException('无权处理此 VIN');
        }
      }

      // 找库位：slotCode 手动指定优先，否则 zoneCode 自动分配
      if (!dto.slotCode && !dto.zoneCode) {
        throw new BadRequestException('必须提供 slotCode (手动) 或 zoneCode (自动)');
      }
      const destYardId = vin.order?.destinationYardId ?? undefined;
      let slot: YardSlot | null;
      if (dto.slotCode) {
        slot = await mgr.findOne(YardSlot, {
          where: destYardId
            ? { code: dto.slotCode, yardId: destYardId }
            : { code: dto.slotCode },
        });
        if (!slot)
          throw new NotFoundException(`目的仓里未找到库位 ${dto.slotCode}`);
      } else {
        slot = await this.pickAutoSlot(mgr, {
          yardId: destYardId,
          zoneCode: dto.zoneCode!,
          preferModel: vin.model ?? null,
          preferColor: vin.color ?? null,
        });
        if (!slot)
          throw new NotFoundException(
            `区域 ${dto.zoneCode} 里没有可用空位`,
          );
      }
      if (slot.status === YardSlotStatus.OCCUPIED) {
        throw new BadRequestException(
          `库位 ${slot.code} 已被 ${slot.currentVin} 占用`,
        );
      }
      if (slot.isLocked) {
        throw new BadRequestException(`库位 ${slot.code} 已锁定`);
      }

      // 校验批次
      if (dto.inboundBatchId) {
        const batch = await mgr.findOne(InboundBatch, {
          where: { id: dto.inboundBatchId },
        });
        if (!batch) throw new NotFoundException('批次不存在');
        if (batch.yardId !== slot.yardId) {
          throw new BadRequestException('批次所属场地与库位不匹配');
        }
      }

      // 占用库位
      slot.status = YardSlotStatus.OCCUPIED;
      slot.currentVin = vin.vin;
      slot.assignedAt = new Date();
      await mgr.save(slot);

      // 更新 VIN：状态 + 存证
      // 存证字段在 dto 里全都可选，但至少要一张照片才允许入库(controller/DTO 层已校验)
      vin.arrivalStatus = OrderVinArrivalStatus.ARRIVED;
      vin.arrivedAt = new Date();
      vin.arrivedByUserId = user.userId;
      vin.slotId = slot.id;
      vin.inboundBatchId = dto.inboundBatchId ?? null;
      vin.arrivalPhotoUrls = dto.photoUrls;
      vin.vehicleCheckInfo = dto.vehicleCheckInfo ?? null;
      vin.arrivalRemark = dto.remark ?? null;
      // 把关系对象也塞进去，前端拿返回值就能读 slot.code（否则要再查一次接口）
      vin.slot = slot;
      return mgr.save(vin);
    });

    await this.audit.log({
      operationType: OperationType.INBOUND_SCAN,
      orderId: saved.orderId,
      vin: saved.vin,
      operatorUserId: user.userId,
      payload: {
        slotCode: saved.slot?.code ?? null,
        yardId: saved.slot?.yardId ?? null,
        photoKeys: dto.photoUrls,
        vehicleCheckInfo: dto.vehicleCheckInfo ?? null,
        remark: dto.remark ?? null,
      },
    });
    return saved;
  }

  // ============ 异常入库：VIN 不在任何订单里但车到了 ============
  // 场景：客户漏发 Excel、或司机误送、或临时补车
  // 策略：给该客户 + 该场地维护一张长期的"散车"订单，把未登记 VIN 挂进去后立刻走入库扫描
  // 单张散车订单 code = INBOUND-STRAY-{customerId 前 8}-{yardId 前 8}，同天同客户同场地复用
  async registerUnexpectedVinAndScan(
    dto: RegisterUnexpectedVinDto,
    user: AuthenticatedUser,
  ): Promise<OrderVin> {
    const scope = await this.scopeService.resolve(user);
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('入库扫描仅内部场地业务员可执行');
    }

    // 已存在同 VIN 直接拒绝，让业务员走标准入库扫描
    const existing = await this.orderVinsRepo.findOne({ where: { vin: dto.vin } });
    if (existing) {
      throw new BadRequestException(
        `VIN ${dto.vin} 已在系统里 (订单 ${existing.orderId})，请走标准入库扫描`,
      );
    }

    // 目的仓解析优先级：dto.yardId 显式传 → slotCode 反查 → YARD_STAFF scopeYardId 兜底
    let yardId: string | undefined = dto.yardId;
    if (!yardId && dto.slotCode) {
      const slot = await this.slotRepo.findOne({ where: { code: dto.slotCode } });
      if (!slot) throw new NotFoundException(`库位 ${dto.slotCode} 不存在`);
      yardId = slot.yardId;
    }
    if (!yardId && scope.role === Role.YARD_STAFF && scope.scopeYardId) {
      yardId = scope.scopeYardId;
    }
    if (!yardId) {
      throw new BadRequestException(
        '无法确定目的场地：请传 yardId、slotCode 或以场地业务员身份登录',
      );
    }
    const yard = await this.yardRepo.findOne({ where: { id: yardId } });
    if (!yard) throw new NotFoundException('目的场地不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);

    // 找/建散车订单
    const strayOrderCode = `INBOUND-STRAY-${dto.customerId.slice(0, 8)}-${yardId.slice(0, 8)}`;
    let strayOrder = await this.ordersRepo.findOne({
      where: {
        orderCode: strayOrderCode,
        customerId: dto.customerId,
        destinationYardId: yardId,
        transportType: TransportType.TRANSFER,
      },
    });
    if (!strayOrder) {
      const data: Partial<Order> = {
        orderCode: strayOrderCode,
        customerOrderNo: null,
        organizationId: yard.organizationId,
        customerId: dto.customerId,
        transportType: TransportType.TRANSFER,
        destinationYardId: yardId,
        originText: '异常入库 / 散车',
        remark: '场地扫码时补录的未登记 VIN 会自动挂到此订单',
      };
      strayOrder = await this.ordersRepo.save(this.ordersRepo.create(data));
    }

    // 事务：建 VIN + 走入库分配 + 落存证
    const saved = await this.dataSource.transaction(async (mgr) => {
      const vinRepo = mgr.getRepository(OrderVin);
      const slotRepo = mgr.getRepository(YardSlot);

      // 建 EXPECTED VIN
      const vinEntity = vinRepo.create({
        orderId: strayOrder!.id,
        vin: dto.vin,
        brand: dto.brand ?? null,
        model: dto.model ?? null,
        color: dto.color ?? null,
        vehicleType: dto.vehicleType ?? null,
        motorNo: dto.motorNo ?? null,
        arrivalStatus: OrderVinArrivalStatus.EXPECTED,
      } as Partial<OrderVin>);
      const vin = await vinRepo.save(vinEntity);

      // 找库位：slotCode > zoneCode，与 inboundScan 语义一致
      if (!dto.slotCode && !dto.zoneCode) {
        throw new BadRequestException(
          '必须提供 slotCode (手动) 或 zoneCode (自动)',
        );
      }
      let slot: YardSlot | null;
      if (dto.slotCode) {
        slot = await slotRepo.findOne({
          where: { code: dto.slotCode, yardId },
        });
        if (!slot) throw new NotFoundException(`库位 ${dto.slotCode} 不存在`);
      } else {
        slot = await this.pickAutoSlot(mgr, {
          yardId,
          zoneCode: dto.zoneCode!,
          preferModel: vin.model ?? null,
          preferColor: vin.color ?? null,
        });
        if (!slot)
          throw new NotFoundException(`区域 ${dto.zoneCode} 里没有可用空位`);
      }
      if (slot.status === YardSlotStatus.OCCUPIED) {
        throw new BadRequestException(
          `库位 ${slot.code} 已被 ${slot.currentVin} 占用`,
        );
      }
      if (slot.isLocked) {
        throw new BadRequestException(`库位 ${slot.code} 已锁定`);
      }

      // 校验批次
      if (dto.inboundBatchId) {
        const batch = await mgr.findOne(InboundBatch, {
          where: { id: dto.inboundBatchId },
        });
        if (!batch) throw new NotFoundException('批次不存在');
        if (batch.yardId !== slot.yardId) {
          throw new BadRequestException('批次所属场地与库位不匹配');
        }
      }

      slot.status = YardSlotStatus.OCCUPIED;
      slot.currentVin = vin.vin;
      slot.assignedAt = new Date();
      await slotRepo.save(slot);

      vin.arrivalStatus = OrderVinArrivalStatus.ARRIVED;
      vin.arrivedAt = new Date();
      vin.arrivedByUserId = user.userId;
      vin.slotId = slot.id;
      vin.inboundBatchId = dto.inboundBatchId ?? null;
      vin.arrivalPhotoUrls = dto.photoUrls;
      vin.vehicleCheckInfo = dto.vehicleCheckInfo ?? null;
      vin.arrivalRemark = dto.remark ?? null;
      vin.slot = slot;
      return vinRepo.save(vin);
    });

    await this.audit.log({
      operationType: OperationType.INBOUND_UNEXPECTED,
      orderId: strayOrder.id,
      vin: saved.vin,
      operatorUserId: user.userId,
      payload: {
        strayOrderCode,
        customerId: dto.customerId,
        slotCode: saved.slot?.code ?? null,
        brand: dto.brand ?? null,
        model: dto.model ?? null,
        color: dto.color ?? null,
        motorNo: dto.motorNo ?? null,
        remark: dto.remark ?? null,
      },
    });
    return saved;
  }

  // ============ 批次管理 ============
  async createBatch(
    dto: CreateInboundBatchDto,
    user: AuthenticatedUser,
  ): Promise<InboundBatch> {
    const scope = await this.scopeService.resolve(user);
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权建批次');
    }
    const yard = await this.yardRepo.findOne({ where: { id: dto.yardId } });
    if (!yard) throw new NotFoundException('场地不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);
    if (
      scope.role === Role.YARD_STAFF &&
      scope.scopeYardId &&
      dto.yardId !== scope.scopeYardId
    ) {
      throw new ForbiddenException('不能在其他场地建批次');
    }
    const dup = await this.batchRepo.findOne({
      where: { batchCode: dto.batchCode },
    });
    if (dup) throw new ConflictException('批次编码已存在');
    const batch = this.batchRepo.create({
      organizationId: yard.organizationId,
      yardId: yard.id,
      batchCode: dto.batchCode,
      arrivedDate: dto.arrivedDate,
      notes: dto.notes ?? null,
      createdByUserId: user.userId,
    });
    return this.batchRepo.save(batch);
  }

  async listBatches(scope: EffectiveScope, yardId?: string): Promise<InboundBatch[]> {
    const qb = this.batchRepo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.yard', 'yard')
      .orderBy('batch.arrivedDate', 'DESC')
      .addOrderBy('batch.createdAt', 'DESC');
    this.scopeService.applyScopeToQuery(qb, 'batch', scope);
    if (yardId) {
      qb.andWhere('batch.yardId = :yardId', { yardId });
    }
    return qb.getMany();
  }

  // ============ 司机维度的提货记录 ============
  async listMyPickups(user: AuthenticatedUser): Promise<OrderVin[]> {
    if (user.role === Role.CARRIER_DRIVER) {
      return this.orderVinsRepo.find({
        where: { pickupDriverUserId: user.userId },
        relations: { order: { customer: true }, pickupCarrier: true },
        order: { pickedUpAt: 'DESC' },
        take: 200,
      });
    }
    if (user.role === Role.CARRIER_STAFF && user.carrierId) {
      return this.orderVinsRepo.find({
        where: { pickupCarrierId: user.carrierId },
        relations: {
          order: { customer: true },
          pickupDriverUser: true,
        },
        order: { pickedUpAt: 'DESC' },
        take: 200,
      });
    }
    return [];
  }

  // 供司机查看 VIN 是否属于自己家承运（预扫描前用）
  async lookupVinForPickup(
    vin: string,
    user: AuthenticatedUser,
  ): Promise<{ vin: OrderVin; canPickup: boolean; reason?: string }> {
    if (!user.carrierId) {
      throw new ForbiddenException('账号未绑定承运商');
    }
    const found = await this.orderVinsRepo.findOne({
      where: { vin },
      relations: { order: { customer: true } },
    });
    if (!found) throw new NotFoundException('系统里未找到此 VIN');
    if (found.pickedUpAt) {
      return {
        vin: found,
        canPickup: false,
        reason: `已于 ${found.pickedUpAt.toISOString()} 被提货`,
      };
    }
    if (found.arrivalStatus === OrderVinArrivalStatus.ARRIVED) {
      return { vin: found, canPickup: false, reason: '已到仓入库' };
    }
    return { vin: found, canPickup: true };
  }

  // ============ 订单纠错 (导入错了要改/删) ============

  // 单条 VIN 编辑：仅 EXPECTED 允许改；不含 vin 字段（VIN 是主键）
  async updateOrderVin(
    orderId: string,
    vinId: string,
    patch: Partial<{
      brand: string;
      model: string;
      color: string;
      vehicleType: string;
      motorNo: string;
      dealerCode: string;
      dealerName: string;
    }>,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<OrderVin> {
    await this.assertOrderInScope(orderId, scope);
    const vin = await this.orderVinsRepo.findOne({
      where: { id: vinId, orderId },
    });
    if (!vin) throw new NotFoundException('VIN 不属于此订单');
    if (vin.arrivalStatus !== OrderVinArrivalStatus.EXPECTED) {
      throw new BadRequestException('已提货/已到仓/已取消的 VIN 不能编辑');
    }
    // 快照 before/after 便于回溯 (只记 patch 里改动的字段)
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      before[key] = (vin as unknown as Record<string, unknown>)[key];
    }
    Object.assign(vin, patch);
    const saved = await this.orderVinsRepo.save(vin);
    await this.audit.log({
      operationType: OperationType.INBOUND_VIN_EDIT,
      orderId,
      vin: vin.vin,
      operatorUserId,
      payload: { before, after: patch },
    });
    return saved;
  }

  // 单条 VIN 软取消：不硬删，只标 arrivalStatus=CANCELLED + 记录操作人
  // 数据保留可追溯 (详情页"已取消" Tab 依旧看得到，鼠标悬浮显示谁/何时取消)
  async cancelOrderVin(
    orderId: string,
    vinId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<void> {
    await this.assertOrderInScope(orderId, scope);
    const vin = await this.orderVinsRepo.findOne({
      where: { id: vinId, orderId },
    });
    if (!vin) throw new NotFoundException('VIN 不属于此订单');
    if (vin.arrivalStatus === OrderVinArrivalStatus.CANCELLED) {
      throw new BadRequestException('VIN 已取消');
    }
    if (vin.arrivalStatus !== OrderVinArrivalStatus.EXPECTED) {
      throw new BadRequestException('已提货/已到仓的 VIN 不能取消，请先撤销入库');
    }
    if (vin.isAllocated || vin.outboundOrderId) {
      throw new BadRequestException('VIN 已被出库单占用，请先撤销出库单');
    }
    await this.orderVinsRepo.update(vin.id, {
      arrivalStatus: OrderVinArrivalStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledByUserId: operatorUserId,
    });
    await this.audit.log({
      operationType: OperationType.INBOUND_VIN_CANCEL,
      orderId,
      vin: vin.vin,
      operatorUserId,
      payload: { previousStatus: vin.arrivalStatus },
    });
  }

  // 整单软取消：Order 打 CANCELLED 标 + 所有 EXPECTED VIN 也打 CANCELLED
  // 关键：VIN 数据完整保留 (含品牌/车型/颜色/客户信息)，只切状态 + 加审计
  // 追溯场景：3 个月后客户问"我那单 100 台车都是啥"，仍能在详情"已取消"Tab 看全
  async cancelInboundOrder(
    orderId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<void> {
    const order = await this.assertOrderInScope(orderId, scope);
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('订单已取消，不需要再次取消');
    }
    if (order.pickupStatus === OrderPickupStatus.IN_PROGRESS) {
      throw new BadRequestException(
        '订单已在提货中，无法取消 —— 请先与承运商协调终止提货',
      );
    }
    const vins = await this.orderVinsRepo.find({ where: { orderId } });
    const bad = vins.filter(
      (v) =>
        v.arrivalStatus !== OrderVinArrivalStatus.EXPECTED &&
        v.arrivalStatus !== OrderVinArrivalStatus.CANCELLED,
    );
    const blocked = vins.filter((v) => v.isAllocated || v.outboundOrderId);
    if (bad.length > 0) {
      throw new BadRequestException(
        `订单里有 ${bad.length} 台车已到仓，无法取消整单 —— 请先撤销入库记录`,
      );
    }
    if (blocked.length > 0) {
      throw new BadRequestException(
        `订单里有 ${blocked.length} 台车已被出库单占用，请先撤销出库单`,
      );
    }
    const now = new Date();
    await this.dataSource.transaction(async (mgr) => {
      // 只更新还没取消的 EXPECTED VIN；已经 CANCELLED 的保持原有审计信息
      await mgr
        .getRepository(OrderVin)
        .createQueryBuilder()
        .update()
        .set({
          arrivalStatus: OrderVinArrivalStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: operatorUserId,
        })
        .where('order_id = :orderId', { orderId })
        .andWhere('arrival_status = :expected', {
          expected: OrderVinArrivalStatus.EXPECTED,
        })
        .execute();
      await mgr.getRepository(Order).update(order.id, {
        status: OrderStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: operatorUserId,
      });
    });
    await this.audit.log({
      operationType: OperationType.INBOUND_ORDER_CANCEL,
      orderId,
      operatorUserId,
      payload: {
        orderCode: order.orderCode,
        vinSnapshot: vins.map((v) => ({
          vin: v.vin,
          brand: v.brand,
          model: v.model,
          color: v.color,
          prevArrivalStatus: v.arrivalStatus,
        })),
      },
    });
  }

  // 重新导入 VIN 到已取消的订单：清 cancel 标记 + status=ACTIVE + 追加 VINs
  // 复用现有 VIN 冲突校验：同一 VIN 在系统里唯一
  async reactivateInboundOrder(
    orderId: string,
    vins: ImportInboundVinRow[],
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{
    orderId: string;
    orderCode: string;
    created: number;
    skipped: number;
  }> {
    const order = await this.assertOrderInScope(orderId, scope);
    if (order.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException('只有已取消的订单可以重新导入 VIN');
    }
    // 去重 + 冲突预检 (复用同 importInboundOrder 里的语义)
    const seen = new Set<string>();
    const uniqueVins = vins.filter((v) => {
      const key = v.vin.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const existing = await this.orderVinsRepo.find({
      where: { vin: In(uniqueVins.map((v) => v.vin)) },
      select: { vin: true },
    });
    const existingSet = new Set(existing.map((e) => e.vin));
    const toInsert = uniqueVins.filter((v) => !existingSet.has(v.vin));
    if (toInsert.length === 0) {
      throw new ConflictException('导入的 VIN 全部已在系统中，无需重复导入');
    }

    await this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(Order).update(order.id, {
        status: OrderStatus.ACTIVE,
        cancelledAt: null,
        cancelledByUserId: null,
      });
      const vinRepo = mgr.getRepository(OrderVin);
      const vinDatas: Partial<OrderVin>[] = toInsert.map((v) => ({
        orderId: order.id,
        vin: v.vin,
        brand: v.brand,
        model: v.model,
        color: v.color,
        vehicleType: v.vehicleType,
        motorNo: v.motorNo,
        arrivalStatus: OrderVinArrivalStatus.EXPECTED,
      }));
      await vinRepo.save(vinRepo.create(vinDatas));
    });

    await this.audit.log({
      operationType: OperationType.INBOUND_ORDER_REACTIVATE,
      orderId: order.id,
      operatorUserId,
      payload: {
        orderCode: order.orderCode,
        created: toInsert.length,
        skipped: uniqueVins.length - toInsert.length,
      },
    });
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      created: toInsert.length,
      skipped: uniqueVins.length - toInsert.length,
    };
  }

  // ============ HQ 提货分派 ============
  // 极兔管理员把入库订单派给某个承运商 (可选到人)。首次派 → PENDING；解除 → 状态回 PENDING
  async assignPickup(
    orderId: string,
    dto: AssignPickupDto,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<Order> {
    const order = await this.assertOrderInScope(orderId, scope);
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('已取消订单无法分派提货');
    }
    // 提货中途禁止改派 (换承运商会导致责任链断裂)；要改先联系承运商中止
    if (
      order.pickupStatus === OrderPickupStatus.IN_PROGRESS &&
      dto.pickupCarrierId !== undefined &&
      dto.pickupCarrierId !== order.pickupCarrierId
    ) {
      throw new BadRequestException(
        '订单已在提货中，无法改派承运商；请先与当前承运商协商终止',
      );
    }
    // 校验 carrier / driver 存在 (null 表示解除)
    if (dto.pickupCarrierId) {
      const carrier = await this.dataSource
        .getRepository(Carrier)
        .findOne({ where: { id: dto.pickupCarrierId } });
      if (!carrier) throw new NotFoundException('承运商不存在');
    }
    if (dto.pickupDriverUserId) {
      const driverUser = await this.dataSource
        .getRepository(User)
        .findOne({ where: { id: dto.pickupDriverUserId } });
      if (!driverUser) throw new NotFoundException('司机账号不存在');
    }

    const before = {
      pickupCarrierId: order.pickupCarrierId,
      pickupDriverUserId: order.pickupDriverUserId,
      plannedPickupDate: order.plannedPickupDate,
    };
    if (dto.pickupCarrierId !== undefined) {
      order.pickupCarrierId = dto.pickupCarrierId;
    }
    if (dto.pickupDriverUserId !== undefined) {
      order.pickupDriverUserId = dto.pickupDriverUserId;
    }
    if (dto.plannedPickupDate !== undefined) {
      order.plannedPickupDate = dto.plannedPickupDate;
    }
    // 状态回归：从 IN_PROGRESS 状态不动 (仍有 pickup 事实)；PENDING/COMPLETED 均可来回
    if (order.pickupStatus !== OrderPickupStatus.IN_PROGRESS) {
      order.pickupStatus = OrderPickupStatus.PENDING;
      order.pickupStartedAt = null;
      order.pickupCompletedAt = null;
    }
    const saved = await this.ordersRepo.save(order);

    await this.audit.log({
      operationType: OperationType.PICKUP_ASSIGN,
      orderId: order.id,
      operatorUserId,
      payload: {
        orderCode: order.orderCode,
        before,
        after: {
          pickupCarrierId: saved.pickupCarrierId,
          pickupDriverUserId: saved.pickupDriverUserId,
          plannedPickupDate: saved.plannedPickupDate,
        },
      },
    });
    return saved;
  }

  // ============ 承运商任务池 ============
  // 承运商侧看"分给我家的入库订单"。CARRIER_STAFF 看整个承运商任务；CARRIER_DRIVER 看整个承运商（同承运商共享）
  async listPickupOrdersForCarrier(
    user: AuthenticatedUser,
    filters?: { status?: OrderPickupStatus; includeCompleted?: boolean },
  ): Promise<
    Array<{
      id: string;
      orderCode: string;
      customerOrderNo: string | null;
      customerName: string;
      originText: string | null;
      destinationYardName: string | null;
      plannedPickupDate: string | null;
      pickupStatus: OrderPickupStatus;
      pickupStartedAt: Date | null;
      pickupCompletedAt: Date | null;
      pickupDriverUserName: string | null;
      total: number;
      pickedUp: number;
      remaining: number;
      createdAt: Date;
    }>
  > {
    if (
      user.role !== Role.CARRIER_DRIVER &&
      user.role !== Role.CARRIER_STAFF
    ) {
      throw new ForbiddenException('仅承运商账号可查看提货任务池');
    }
    if (!user.carrierId) {
      throw new ForbiddenException('账号未绑定承运商');
    }
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.pickupDriverUser', 'pickupDriverUser')
      .where('order.transportType = :type', { type: TransportType.TRANSFER })
      .andWhere('order.status = :active', { active: OrderStatus.ACTIVE })
      .andWhere('order.pickupCarrierId = :cid', { cid: user.carrierId })
      .orderBy('order.plannedPickupDate', 'ASC', 'NULLS LAST')
      .addOrderBy('order.createdAt', 'DESC');

    if (filters?.status) {
      qb.andWhere('order.pickupStatus = :ps', { ps: filters.status });
    } else if (!filters?.includeCompleted) {
      qb.andWhere('order.pickupStatus IN (:...ps)', {
        ps: [OrderPickupStatus.PENDING, OrderPickupStatus.IN_PROGRESS],
      });
    }
    const orders = await qb.getMany();
    if (orders.length === 0) return [];

    // 聚合进度：一次查询按 order_id group
    const stats = await this.orderVinsRepo
      .createQueryBuilder('v')
      .select('v.order_id', 'orderId')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE v.picked_up_at IS NOT NULL)::int`,
        'pickedUp',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE v.arrival_status IN ('${OrderVinArrivalStatus.ARRIVED}','${OrderVinArrivalStatus.CANCELLED}'))::int`,
        'settled',
      )
      .where('v.order_id IN (:...ids)', { ids: orders.map((o) => o.id) })
      .groupBy('v.order_id')
      .getRawMany<{ orderId: string; total: number; pickedUp: number; settled: number }>();
    const statMap = new Map(stats.map((s) => [s.orderId, s]));

    return orders.map((o) => {
      const s = statMap.get(o.id) ?? { total: 0, pickedUp: 0, settled: 0 };
      return {
        id: o.id,
        orderCode: o.orderCode,
        customerOrderNo: o.customerOrderNo,
        customerName: o.customer?.name ?? '-',
        originText: o.originText ?? null,
        destinationYardName: o.destinationYard?.name ?? null,
        plannedPickupDate: o.plannedPickupDate,
        pickupStatus: o.pickupStatus,
        pickupStartedAt: o.pickupStartedAt,
        pickupCompletedAt: o.pickupCompletedAt,
        pickupDriverUserName: o.pickupDriverUser?.displayName ?? null,
        total: s.total,
        pickedUp: s.pickedUp,
        remaining: Math.max(0, s.total - s.pickedUp - s.settled),
        createdAt: o.createdAt,
      };
    });
  }

  // 单个提货任务详情（承运商视角）
  async getPickupOrderDetail(orderId: string, user: AuthenticatedUser) {
    if (
      user.role !== Role.CARRIER_DRIVER &&
      user.role !== Role.CARRIER_STAFF
    ) {
      throw new ForbiddenException('仅承运商账号可查看提货任务');
    }
    if (!user.carrierId) {
      throw new ForbiddenException('账号未绑定承运商');
    }
    const order = await this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.pickupDriverUser', 'pickupDriverUser')
      .where('order.id = :id', { id: orderId })
      .andWhere('order.transportType = :type', {
        type: TransportType.TRANSFER,
      })
      .andWhere('order.pickupCarrierId = :cid', { cid: user.carrierId })
      .getOne();
    if (!order) throw new NotFoundException('提货任务不存在或不属您承运商');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('订单已取消');
    }

    const vins = await this.orderVinsRepo.find({
      where: { orderId },
      order: { vin: 'ASC' },
      relations: { pickupDriverUser: true, pickupCarrier: true },
    });
    const stats = await this.pickupOrderStats(orderId);
    return { order, vins, stats };
  }

  // 承运商在某个提货任务里扫 VIN
  // 允许扫到"不属本任务"的 VIN：默认接受并挪去它真正的订单；App 端 allowOutOfOrder=false 走严格
  // 触发订单生命周期：第一次 pickup 事件 → IN_PROGRESS；全部消化完 → COMPLETED
  async pickupOrderScan(
    orderId: string,
    dto: PickupOrderScanDto,
    user: AuthenticatedUser,
  ): Promise<{
    vin: OrderVin;
    outOfOrder: boolean;
    orderPickupStatus: OrderPickupStatus;
  }> {
    if (
      user.role !== Role.CARRIER_DRIVER &&
      user.role !== Role.CARRIER_STAFF
    ) {
      throw new ForbiddenException('仅承运商账号可执行提货扫描');
    }
    if (!user.carrierId) {
      throw new ForbiddenException('账号未绑定承运商');
    }

    const targetOrder = await this.ordersRepo.findOne({
      where: { id: orderId, transportType: TransportType.TRANSFER },
    });
    if (!targetOrder) throw new NotFoundException('提货任务不存在');
    if (targetOrder.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('订单已取消');
    }
    if (targetOrder.pickupCarrierId !== user.carrierId) {
      throw new ForbiddenException('此任务未分派给您的承运商');
    }

    const vin = await this.orderVinsRepo.findOne({
      where: { vin: dto.vin },
      relations: { order: true },
    });
    if (!vin) {
      throw new NotFoundException('系统里未找到此 VIN，请确认是否已导入订单');
    }
    if (vin.pickedUpAt) {
      throw new BadRequestException(
        `此 VIN 已于 ${vin.pickedUpAt.toISOString()} 被提货过`,
      );
    }
    if (vin.arrivalStatus === OrderVinArrivalStatus.ARRIVED) {
      throw new BadRequestException('此 VIN 已到仓入库，无法再提货');
    }
    if (vin.arrivalStatus === OrderVinArrivalStatus.CANCELLED) {
      throw new BadRequestException('此 VIN 已取消，不需要提货');
    }

    // VIN 是否属于当前任务
    const outOfOrder = vin.orderId !== orderId;
    if (outOfOrder) {
      const allow = dto.allowOutOfOrder ?? true;
      if (!allow) {
        throw new BadRequestException(
          `此 VIN 不在本任务，属于订单 ${vin.order?.orderCode ?? '未知'}`,
        );
      }
      // 承运商权限：VIN 所在订单也必须已分派给本承运商 (跨承运商无权代提)
      if (vin.order && vin.order.pickupCarrierId !== user.carrierId) {
        throw new ForbiddenException(
          `此 VIN 属订单 ${vin.order.orderCode}，不在您承运商的任务池`,
        );
      }
    }

    // 写入 VIN 提货字段
    vin.pickupCarrierId = user.carrierId;
    vin.pickupDriverUserId = user.userId;
    vin.pickedUpAt = new Date();
    vin.pickupLocation =
      dto.location ?? vin.order?.originText ?? targetOrder.originText ?? null;
    vin.pickupPhotoUrls = dto.photoUrls ?? null;
    vin.pickupRemark = dto.remark ?? null;
    const saved = await this.orderVinsRepo.save(vin);

    // 触发 VIN 所在真实订单的状态流转（可能是 targetOrder 也可能是别的）
    const affectedOrderId = vin.orderId;
    const affectedOrder = affectedOrderId === orderId
      ? targetOrder
      : await this.ordersRepo.findOne({ where: { id: affectedOrderId } });
    if (affectedOrder) {
      const now = new Date();
      let statusChanged = false;
      if (affectedOrder.pickupStatus === OrderPickupStatus.PENDING) {
        affectedOrder.pickupStatus = OrderPickupStatus.IN_PROGRESS;
        affectedOrder.pickupStartedAt = now;
        statusChanged = true;
      }
      const s = await this.pickupOrderStats(affectedOrderId);
      if (s.remaining === 0 && s.total > 0) {
        affectedOrder.pickupStatus = OrderPickupStatus.COMPLETED;
        affectedOrder.pickupCompletedAt = now;
        statusChanged = true;
      }
      if (statusChanged) {
        await this.ordersRepo.save(affectedOrder);
      }
      if (affectedOrder.pickupStatus === OrderPickupStatus.COMPLETED) {
        await this.audit.log({
          operationType: OperationType.PICKUP_COMPLETE,
          orderId: affectedOrder.id,
          operatorUserId: user.userId,
          payload: {
            orderCode: affectedOrder.orderCode,
            total: s.total,
            pickedUp: s.pickedUp,
          },
        });
      }
    }

    await this.audit.log({
      operationType: OperationType.PICKUP_SCAN,
      orderId: affectedOrderId,
      vin: saved.vin,
      operatorUserId: user.userId,
      payload: {
        taskOrderId: orderId,
        outOfOrder,
        location: saved.pickupLocation,
        photoKeys: dto.photoUrls ?? null,
        remark: dto.remark ?? null,
      },
    });

    return {
      vin: saved,
      outOfOrder,
      orderPickupStatus: affectedOrder?.pickupStatus ?? OrderPickupStatus.PENDING,
    };
  }

  // 单个订单聚合提货进度（供承运商侧列表/详情复用）
  async pickupOrderStats(orderId: string): Promise<{
    total: number;
    pickedUp: number;
    arrived: number;
    cancelled: number;
    remaining: number;
  }> {
    const row = await this.orderVinsRepo
      .createQueryBuilder('v')
      .select('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE v.picked_up_at IS NOT NULL)::int`,
        'pickedUp',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE v.arrival_status = '${OrderVinArrivalStatus.ARRIVED}')::int`,
        'arrived',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE v.arrival_status = '${OrderVinArrivalStatus.CANCELLED}')::int`,
        'cancelled',
      )
      .where('v.order_id = :orderId', { orderId })
      .getRawOne<{
        total: number;
        pickedUp: number;
        arrived: number;
        cancelled: number;
      }>();
    const total = row?.total ?? 0;
    const pickedUp = row?.pickedUp ?? 0;
    const arrived = row?.arrived ?? 0;
    const cancelled = row?.cancelled ?? 0;
    // remaining = 需要提货的剩余数：不含 已提货 / 已到仓 / 已取消
    const remaining = Math.max(0, total - pickedUp - arrived - cancelled);
    return { total, pickedUp, arrived, cancelled, remaining };
  }

  private async assertOrderInScope(
    orderId: string,
    scope: EffectiveScope,
  ): Promise<Order> {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .where('order.id = :id', { id: orderId })
      .andWhere('order.transportType = :type', {
        type: TransportType.TRANSFER,
      });
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
    });
    const order = await qb.getOne();
    if (!order) throw new NotFoundException('入库订单不存在或无权访问');
    return order;
  }
}
