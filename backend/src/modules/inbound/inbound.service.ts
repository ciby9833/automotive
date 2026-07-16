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
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ImportInboundOrderDto } from './dto/import-inbound-order.dto';
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
  ) {}

  // ============ Excel 导入 ============
  // 一份 Excel = 一张入库订单 + N 条 VIN；VIN 全局去重(跨订单)
  async importInboundOrder(
    dto: ImportInboundOrderDto,
    scope: EffectiveScope,
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

    return this.dataSource.transaction(async (mgr) => {
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
  }

  // ============ 入库订单列表/详情 ============
  async listInboundOrders(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      destinationYardId?: string;
      customerOrderNo?: string;
      organizationId?: string;
      status?: 'ALL' | 'PENDING' | 'COMPLETED';
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
    }>
  > {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .where('order.transportType = :type', { type: TransportType.TRANSFER })
      .orderBy('order.createdAt', 'DESC');
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
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  async getInboundOrderDetail(id: string, scope: EffectiveScope) {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.destinationYard', 'yard')
      .leftJoinAndSelect('order.organization', 'organization')
      .where('order.id = :id', { id })
      .andWhere('order.transportType = :type', {
        type: TransportType.TRANSFER,
      });
    this.scopeService.applyScopeToQuery(qb, 'order', scope, {
      customerIdCol: 'customerId',
    });
    const order = await qb.getOne();
    if (!order) throw new NotFoundException('入库订单不存在');

    const vins = await this.orderVinsRepo.find({
      where: { orderId: id },
      relations: {
        pickupCarrier: true,
        pickupDriverUser: true,
        arrivedByUser: true,
        slot: { yard: true },
        inboundBatch: true,
      },
      order: { vin: 'ASC' },
    });
    return { order, vins };
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
    return this.orderVinsRepo.save(vin);
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

    return this.dataSource.transaction(async (mgr) => {
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
}
