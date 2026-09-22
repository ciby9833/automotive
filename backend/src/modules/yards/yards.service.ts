import { OperationalUpdatesService } from '../operational-updates/operational-updates.service';
import { YardBoardCache } from './yard-board-cache';
import { YardInventory } from '../inventory/entities/yard-inventory.entity';
import { Order } from '../orders/entities/order.entity';
import { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto';
import { InventoryService } from '../inventory/inventory.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  DEFAULT_PAGE_SIZE,
  EXPORT_MAX_ROWS,
  PaginatedResult,
} from '../../common/dto/paginated.dto';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { Yard } from './entities/yard.entity';
import { YardSlot, YardSlotStatus } from './entities/yard-slot.entity';
import { YardZone } from './entities/yard-zone.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { WaybillVin } from '../waybills/entities/waybill-vin.entity';
import { WaybillStatusLog } from '../tracking/entities/waybill-status-log.entity';
import { CreateYardDto } from './dto/create-yard.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '../../common/enums/role.enum';
import {
  formatSlotCode,
  parseSlotCode,
  slotDisplayCodeSql,
} from './slot-code.util';

// VIN 库存查询返回结构（联表 order_vins 拿车型/颜色，未挂订单的 VIN 用 null）
export interface VinInventoryRow {
  vin: string;
  yardId: string;
  yardCode: string;
  yardName: string;
  organizationId: string;
  slotId: string | null;
  slotCode: string | null; // 计算得到：`${zone.code}-${line:02}-${row:02}`
  zoneCode: string | null;
  line: number | null;
  row: number | null;
  assignedAt: Date | null;
  stayDays: number;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  orderCode: string | null;
}

// slot 附带 zone 后前端友好的展示结构
export interface SlotView {
  id: string;
  yardId: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string | null;
  zoneIsActive: boolean;
  zonePurpose: 'PARKING' | 'STAGING';
  line: number;
  row: number;
  status: YardSlotStatus;
  currentVin: string | null;
  assignedAt: Date | null;
  isLocked: boolean;
  lockedAt: Date | null;
}

function slotToView(slot: YardSlot): SlotView {
  const zoneCode = slot.zone?.code ?? '';
  return {
    id: slot.id,
    yardId: slot.yardId,
    zoneId: slot.zoneId,
    zoneCode,
    zoneName: slot.zone?.name ?? null,
    zoneIsActive: slot.zone?.isActive ?? false,
    zonePurpose: slot.zone.purpose,
    line: slot.line,
    row: slot.row,
    status: slot.status,
    currentVin: slot.currentVin,
    assignedAt: slot.assignedAt,
    isLocked: slot.isLocked,
    lockedAt: slot.lockedAt,
  };
}

@Injectable()
export class YardsService {
  private readonly boardCache = new YardBoardCache();
  private readonly invalidateBoard = this.boardCache.invalidate;
  private readonly resetBoard = this.boardCache.reset;
  onModuleDestroy() {
    this.updates.events.off('change', this.invalidateBoard);
    this.updates.events.off('reset', this.resetBoard);
  }
  constructor(
    private readonly inventory: InventoryService,
    @InjectRepository(Yard)
    private readonly yardsRepository: Repository<Yard>,
    @InjectRepository(YardSlot)
    private readonly slotsRepository: Repository<YardSlot>,
    @InjectRepository(OrderVin)
    private readonly orderVinsRepository: Repository<OrderVin>,
    @InjectRepository(WaybillVin)
    private readonly waybillVinsRepository: Repository<WaybillVin>,
    @InjectRepository(WaybillStatusLog)
    private readonly statusLogsRepository: Repository<WaybillStatusLog>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
    private readonly updates: OperationalUpdatesService,
  ) {
    updates.events.on('change', this.invalidateBoard);
    updates.events.on('reset', this.resetBoard);
  }

  findAll(scope: EffectiveScope, narrowToOrgId?: string): Promise<Yard[]> {
    const qb = this.yardsRepository
      .createQueryBuilder('yard')
      .leftJoinAndSelect('yard.organization', 'organization')
      .orderBy('organization.name', 'ASC')
      .addOrderBy('yard.name', 'ASC');
    this.scopeService.applyScopeToQuery(qb, 'yard', scope, {
      yardIdCols: ['id'],
      narrowToOrgId,
    });
    return qb.getMany();
  }

  async findOne(id: string, scope: EffectiveScope): Promise<Yard> {
    const qb = this.yardsRepository
      .createQueryBuilder('yard')
      .where('yard.id = :id', { id });
    this.scopeService.applyScopeToQuery(qb, 'yard', scope, {
      yardIdCols: ['id'],
    });
    const yard = await qb.getOne();
    if (!yard) throw new NotFoundException('场地不存在');
    return yard;
  }

  create(dto: CreateYardDto, scope: EffectiveScope): Promise<Yard> {
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    return this.yardsRepository.save(this.yardsRepository.create(dto));
  }

  // 场地下所有库位（联 zone）；按 zone.code, line, row 排序，前端表格易读
  async findSlots(yardId: string, scope: EffectiveScope): Promise<SlotView[]> {
    return this.readSlots(await this.findOne(yardId, scope));
  }

  private async readSlots(
    yard: Yard,
    manager = this.dataSource.manager,
  ): Promise<SlotView[]> {
    const slots = await manager.getRepository(YardSlot).find({
      where: { yardId: yard.id },
      relations: { zone: true },
      order: {},
    });
    return slots
      .sort((a, b) => {
        const za = a.zone?.code ?? '';
        const zb = b.zone?.code ?? '';
        if (za !== zb) return za.localeCompare(zb);
        if (a.line !== b.line) return a.line - b.line;
        return a.row - b.row;
      })
      .map((slot) => ({
        ...slotToView(slot),
        zoneIsActive: yard.isActive && slot.zone.isActive,
      }));
  }

  async board(yardId: string, scope: EffectiveScope, since?: string) {
    const yard = await this.findOne(yardId, scope);
    // Authorization precedes shared data lookup; the cache never contains permission decisions.
    return this.boardCache.get(
      yardId,
      () =>
        this.dataSource.transaction('REPEATABLE READ', async (manager) => {
          const snapshotYard = await manager.findOneByOrFail(Yard, {
            id: yard.id,
            organizationId: yard.organizationId,
          });
          const [slots, stats] = await Promise.all([
            this.readSlots(snapshotYard, manager),
            this.readStats(snapshotYard, manager),
          ]);
          return { slots, stats };
        }),
      since,
    );
  }

  async yardStats(yardId: string, scope: EffectiveScope) {
    return this.readStats(await this.findOne(yardId, scope));
  }

  private async readStats(
    yard: Yard,
    manager = this.dataSource.manager,
  ): Promise<Record<string, number | null>> {
    // Count in PostgreSQL, not by hydrating every slot, zone and vehicle into Node.js.
    const [stats] = await manager.query(
      `
      WITH capacity AS (
        SELECT count(*)::int AS total,
          count(*) FILTER(WHERE s.status='OCCUPIED')::int AS occupied,
          count(*) FILTER(WHERE $2 AND z.is_active)::int AS "enabledCapacity",
          count(*) FILTER(WHERE $2 AND z.is_active AND NOT s.is_locked AND s.status='VACANT')::int AS "availableCapacity",
          count(*) FILTER(WHERE $2 AND z.is_active AND s.is_locked)::int AS "frozenCapacity",
          count(*) FILTER(WHERE NOT $2 OR NOT z.is_active)::int AS "disabledCapacity",
          count(*) FILTER(WHERE $2 AND z.is_active AND NOT s.is_locked)::int AS "usableCapacity",
          count(*) FILTER(WHERE $2 AND z.is_active AND NOT s.is_locked AND s.status='OCCUPIED')::int AS "occupiedUsable",
          count(*) FILTER(WHERE $2 AND z.is_active AND NOT s.is_locked AND z.purpose='PARKING')::int AS "parkingCapacity",
          count(*) FILTER(WHERE $2 AND z.is_active AND NOT s.is_locked AND z.purpose='STAGING')::int AS "stagingCapacity"
        FROM yard_slots s JOIN yard_zones z ON z.id=s.zone_id WHERE s.yard_id=$1
      ), stock AS (
        SELECT count(*)::int AS "onSite",count(*) FILTER(WHERE position='PARKING')::int AS parking,
          count(*) FILTER(WHERE position='STAGING')::int AS staging,count(*) FILTER(WHERE position='LOADED')::int AS loaded
        FROM yard_inventory WHERE yard_id=$1 AND closed_at IS NULL
      ), design AS (
        SELECT COALESCE(sum(line_count*row_count),0)::int AS "designCapacity" FROM yard_zones WHERE yard_id=$1
      )
      SELECT c.*,s.*,d.*,c."availableCapacity" AS vacant,d."designCapacity"-c.total AS "ungeneratedCapacity",
        (SELECT long_stay_days FROM organization_operating_policies WHERE organization_id=$3) AS "longStayDays"
      FROM capacity c CROSS JOIN stock s CROSS JOIN design d`,
      [yard.id, yard.isActive, yard.organizationId],
    );
    return stats;
  }

  async undoInbound(
    vin: string,
    reason: string,
    scope: EffectiveScope,
    userId: string,
  ) {
    return this.dataSource.transaction(async (mgr) => {
      const stock = await this.inventory.active(mgr, vin);
      const yard = await this.findOne(stock.yardId, scope);
      this.scopeService.assertOrgWritable(scope, yard.organizationId);
      await this.inventory.close(mgr, stock, 'UNDO_INBOUND', {
        userId,
        reason,
      });
      return { ok: true };
    });
  }

  async adjustInventory(
    dto: InventoryAdjustmentDto,
    scope: EffectiveScope,
    userId: string,
  ) {
    const yard = await this.findOne(dto.yardId, scope);
    this.scopeService.assertOrgWritable(scope, yard.organizationId);
    if (!dto.reason.trim() || !dto.reference.trim())
      throw new BadRequestException('盘点单号和调整原因必填');
    return this.dataSource.transaction(async (mgr) => {
      const context = { userId, reason: dto.reason, reference: dto.reference };
      await this.inventory.lockVin(mgr, dto.vin);
      if (dto.direction === 'OUT') {
        const stock = await this.inventory.active(mgr, dto.vin);
        if (stock.yardId !== yard.id)
          throw new BadRequestException('车辆不在当前场地');
        await this.inventory.close(mgr, stock, 'ADJUST_OUT', context);
      } else {
        if (!dto.slotId || !dto.enteredAt || !dto.photoUrls?.length)
          throw new BadRequestException('盘盈需填写库位、实际到场时间及照片');
        const enteredAt = new Date(dto.enteredAt);
        if (enteredAt.getTime() > Date.now())
          throw new BadRequestException('实际到场时间不能晚于现在');
        const vin = await mgr
          .getRepository(OrderVin)
          .createQueryBuilder('v')
          .innerJoinAndSelect('v.order', 'o')
          .where(
            'v.vin=:vin AND o.organizationId=:org AND o.destinationYardId=:yard',
            { vin: dto.vin, org: yard.organizationId, yard: yard.id },
          )
          .setLock('pessimistic_write', undefined, ['v'])
          .getOne();
        if (
          !vin ||
          vin.arrivalStatus === OrderVinArrivalStatus.CANCELLED ||
          vin.isAllocated ||
          vin.outboundOrderId
        )
          throw new BadRequestException(
            '需先维护本场地有效入库订单，且车辆不能关联出库业务',
          );
        const slot = await this.inventory.slot(mgr, dto.slotId, yard.id);
        vin.slotId = slot.id;
        vin.arrivalStatus = OrderVinArrivalStatus.ARRIVED;
        vin.arrivedAt = enteredAt;
        vin.arrivedByUserId = userId;
        vin.arrivalPhotoUrls = dto.photoUrls;
        vin.arrivalRemark = dto.reason;
        slot.status = YardSlotStatus.OCCUPIED;
        slot.currentVin = vin.vin;
        slot.assignedAt = enteredAt;
        await mgr.save(slot);
        await mgr.save(vin);
        await this.inventory.receive(mgr, vin, slot, context, 'ADJUST_IN');
      }
      return { ok: true };
    });
  }

  async moveSlot(
    fromSlotId: string,
    toSlotId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ) {
    const source = await this.slotsRepository.findOneBy({ id: fromSlotId });
    if (!source?.currentVin) throw new BadRequestException('源库位当前无车');
    const yard = await this.findOne(source.yardId, scope);
    this.scopeService.assertOrgWritable(scope, yard.organizationId);
    await this.dataSource.transaction(async (mgr) => {
      const stock = await this.inventory.active(mgr, source.currentVin!);
      if (stock.slotId !== fromSlotId)
        throw new BadRequestException('车辆位置已变化，请刷新');
      await this.inventory.move(mgr, stock, toSlotId, {
        userId: operatorUserId,
      });
    });
    const slots = await this.slotsRepository.find({
      where: [{ id: fromSlotId }, { id: toSlotId }],
      relations: { zone: true },
    });
    return {
      from: slotToView(slots.find((s) => s.id === fromSlotId)!),
      to: slotToView(slots.find((s) => s.id === toSlotId)!),
    };
  }

  // VIN 库存查询（改用 zone + line + row 计算 slotCode）
  async vinInventory(
    scope: EffectiveScope,
    filters: {
      vin?: string;
      organizationId?: string;
      yardId?: string;
      slotCode?: string;
      orderCode?: string;
      minStayDays?: number;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      all?: boolean;
    },
  ): Promise<PaginatedResult<VinInventoryRow>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    if (scope.type !== 'ORG') {
      return { items: [], total: 0, page, pageSize };
    }
    let orgIds = scope.orgIds;
    if (filters.organizationId) {
      if (!scope.orgIds.includes(filters.organizationId)) {
        throw new ForbiddenException('无权按该机构筛选');
      }
      orgIds = [filters.organizationId];
    }

    const sortKey = filters.sortBy ?? 'assignedAt';
    const rawOrder: 'ASC' | 'DESC' =
      filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const qb = this.dataSource
      .getRepository(YardInventory)
      .createQueryBuilder('stock')
      .innerJoin(Yard, 'yard', 'yard.id=stock.yardId')
      .innerJoin(OrderVin, 'ov', 'ov.id=stock.orderVinId')
      .innerJoin(Order, 'ord', 'ord.id=ov.orderId')
      .innerJoin(
        'organization_operating_policies',
        'policy',
        'policy.organization_id=stock.organizationId',
      )
      .leftJoin(YardSlot, 'slot', 'slot.id=stock.slotId')
      .leftJoin(YardZone, 'zone', 'zone.id=slot.zoneId')
      .where(
        'stock.closedAt IS NULL AND stock.organizationId IN (:...orgIds)',
        { orgIds },
      );
    if (scope.role === Role.YARD_STAFF)
      qb.andWhere('stock.yardId=:scopeYard', { scopeYard: scope.scopeYardId });
    if (filters.yardId)
      qb.andWhere('stock.yardId=:yardId', { yardId: filters.yardId });
    if (filters.vin)
      qb.andWhere('stock.vin ILIKE :vin', { vin: `%${filters.vin}%` });
    if (filters.orderCode)
      qb.andWhere('ord.orderCode ILIKE :orderCode', {
        orderCode: `%${filters.orderCode}%`,
      });
    if (filters.slotCode)
      qb.andWhere(`(${slotDisplayCodeSql('slot', 'zone')}) ILIKE :slotCode`, {
        slotCode: `%${filters.slotCode}%`,
      });
    if (filters.dateFrom)
      qb.andWhere('stock.enteredAt >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    if (filters.dateTo)
      qb.andWhere('stock.enteredAt <= :dateTo', { dateTo: filters.dateTo });
    if (filters.minStayDays)
      qb.andWhere("stock.enteredAt <= NOW() - (:days * interval '1 day')", {
        days: filters.minStayDays,
      });
    const total = await qb.getCount();
    if (filters.all && total > EXPORT_MAX_ROWS)
      throw new BadRequestException('导出超过上限，请缩小查询范围');
    qb.select([
      'stock.vin AS vin',
      'stock.position AS position',
      'policy.long_stay_days AS "longStayDays"',
      '(NOW()-stock.entered_at > policy.long_stay_days * interval \'1 day\') AS "isLongStay"',
      'yard.id AS "yardId"',
      'yard.code AS "yardCode"',
      'yard.name AS "yardName"',
      'stock.organizationId AS "organizationId"',
      'slot.id AS "slotId"',
      `${slotDisplayCodeSql('slot', 'zone')} AS "slotCode"`,
      'zone.code AS "zoneCode"',
      'slot.line AS line',
      'slot.row AS row',
      'stock.enteredAt AS "assignedAt"',
      'ov.model AS model',
      'ov.color AS color',
      'ov.vehicleType AS "vehicleType"',
      'ord.orderCode AS "orderCode"',
      'GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (NOW()-stock.entered_at))/86400))::int AS "stayDays"',
    ]);
    const columns = {
      assignedAt: 'stock.enteredAt',
      stayDays: 'stock.enteredAt',
      slotCode: 'zone.code',
      yardName: 'yard.name',
    };
    qb.orderBy(
      columns[sortKey] ?? 'stock.enteredAt',
      sortKey === 'stayDays' ? (rawOrder === 'ASC' ? 'DESC' : 'ASC') : rawOrder,
    ).addOrderBy('stock.id', 'ASC');
    if (!filters.all) qb.offset((page - 1) * pageSize).limit(pageSize);
    return { items: await qb.getRawMany(), total, page, pageSize };
  }

  async getVinLifecycle(vin: string, scope: EffectiveScope) {
    const orderVin = await this.orderVinsRepository.findOne({
      where: { vin },
      relations: {
        order: { customer: true, destinationYard: true },
        pickupCarrier: true,
        pickupDriverUser: true,
        arrivedByUser: true,
        slot: { yard: true, zone: true },
        inboundBatch: true,
      },
    });

    if (orderVin?.order) {
      if (
        scope.type === 'ORG' &&
        !scope.orgIds.includes(orderVin.order.organizationId)
      ) {
        throw new NotFoundException('VIN 不存在');
      }
      if (
        scope.type === 'CUSTOMER' &&
        orderVin.order.customerId !== scope.customerId
      ) {
        throw new NotFoundException('VIN 不存在');
      }
    }

    const waybillVins = await this.waybillVinsRepository.find({
      where: { vin },
      relations: {
        waybill: {
          carrier: true,
          driver: true,
          originYard: true,
          destinationDealer: true,
        },
      },
      order: { createdAt: 'DESC' },
    });

    const events = await this.statusLogsRepository.find({
      where: { vin },
      relations: { operator: true, yard: true, waybill: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    if (scope.type !== 'ORG')
      throw new ForbiddenException('仅内部人员可查库存流水');
    if (
      !orderVin?.order ||
      (scope.role === Role.YARD_STAFF &&
        orderVin.order.destinationYardId !== scope.scopeYardId)
    )
      throw new NotFoundException('VIN 不存在');
    const inventoryMovements = await this.dataSource.query(
      `SELECT m.id,m.kind,m.delta,m.occurred_at AS "occurredAt",
      m.reason,m.reference,m.before_state AS "beforeState",m.after_state AS "afterState",u."displayName" AS "operatorName"
      FROM inventory_movements m LEFT JOIN users u ON u.id=m.operator_user_id
      WHERE m.vin=$1 AND m.organization_id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR m.yard_id=$3)
      ORDER BY m.id DESC LIMIT 200`,
      [
        vin,
        scope.orgIds,
        scope.role === Role.YARD_STAFF ? scope.scopeYardId : null,
      ],
    );
    return {
      vin,
      orderVin,
      inventoryMovements,
      waybills: waybillVins.map((wv) => wv.waybill).filter(Boolean),
      events,
    };
  }

  // 批量移位（仅限本场地已在库车辆）
  // 每行 slotCode 是"AB6-01-07"字符串；先解析→查 zone→定位 slot
  async batchAssignSlots(
    yardId: string,
    items: Array<{ vin: string; slotCode: string }>,
    scope: EffectiveScope,
    operatorUserId: string,
  ) {
    const yard = await this.findOne(yardId, scope);
    this.scopeService.assertOrgWritable(scope, yard.organizationId);
    const seen = new Set<string>();
    const failed: Array<{ vin: string; slotCode: string; reason: string }> = [];
    const skipped: Array<{ vin: string; reason: string }> = [];
    let succeeded = 0;
    for (const row of items) {
      const vin = row.vin.trim().toUpperCase();
      if (seen.has(vin)) {
        failed.push({ ...row, reason: '文件中 VIN 重复，请去重后重试' });
        continue;
      }
      seen.add(vin);
      try {
        const parsed = parseSlotCode(row.slotCode);
        if (!parsed) throw new BadRequestException('库位码格式错误');
        const result = await this.dataSource.transaction(async (mgr) => {
          const stock = await this.inventory.active(mgr, vin);
          if (
            stock.yardId !== yardId ||
            stock.organizationId !== yard.organizationId
          )
            throw new BadRequestException('只允许当前场地在库车辆移位');
          const target = await mgr
            .getRepository(YardSlot)
            .createQueryBuilder('s')
            .innerJoin('s.zone', 'z')
            .where(
              's.yardId=:yardId AND z.code=:code AND s.line=:line AND s.row=:row',
              { yardId, ...parsed, code: parsed.zoneCode },
            )
            .getOne();
          if (!target) throw new BadRequestException('目标库位不存在');
          if (stock.slotId === target.id) return false;
          await this.inventory.move(mgr, stock, target.id, {
            userId: operatorUserId,
          });
          return true;
        });
        if (result) succeeded++;
        else skipped.push({ vin, reason: '已在目标库位' });
      } catch (error) {
        failed.push({ ...row, reason: (error as Error).message });
      }
    }
    return { total: items.length, succeeded, skipped, failed };
  }
}
