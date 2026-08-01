import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
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
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
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
  slotId: string;
  slotCode: string; // 计算得到：`${zone.code}-${line:02}-${row:02}`
  zoneCode: string;
  line: number;
  row: number;
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
  constructor(
    @InjectRepository(Yard)
    private readonly yardsRepository: Repository<Yard>,
    @InjectRepository(YardSlot)
    private readonly slotsRepository: Repository<YardSlot>,
    @InjectRepository(YardZone)
    private readonly zonesRepository: Repository<YardZone>,
    @InjectRepository(OrderVin)
    private readonly orderVinsRepository: Repository<OrderVin>,
    @InjectRepository(WaybillVin)
    private readonly waybillVinsRepository: Repository<WaybillVin>,
    @InjectRepository(WaybillStatusLog)
    private readonly statusLogsRepository: Repository<WaybillStatusLog>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

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
    await this.findOne(yardId, scope);
    const slots = await this.slotsRepository.find({
      where: { yardId },
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
      .map(slotToView);
  }

  async yardStats(yardId: string, scope: EffectiveScope) {
    await this.findOne(yardId, scope);
    const [total, occupied] = await Promise.all([
      this.slotsRepository.count({ where: { yardId } }),
      this.slotsRepository.count({
        where: { yardId, status: YardSlotStatus.OCCUPIED },
      }),
    ]);
    return { total, occupied, vacant: total - occupied };
  }

  async assignSlot(
    slotId: string,
    vin: string,
    scope: EffectiveScope,
  ): Promise<SlotView> {
    const scopedSlot = await this.slotsRepository.findOne({ where: { id: slotId } });
    if (!scopedSlot) throw new NotFoundException('库位不存在');
    await this.findOne(scopedSlot.yardId, scope);
    return this.dataSource.transaction(async (mgr) => {
      const slotRepo = mgr.getRepository(YardSlot);
      const slot = await slotRepo
        .createQueryBuilder('slot')
        .innerJoinAndSelect('slot.zone', 'zone')
        .where('slot.id = :slotId', { slotId })
        .setLock('pessimistic_write', undefined, ['slot'])
        .getOne();
      if (!slot) throw new NotFoundException('库位不存在');
      if (!slot.zone.isActive) {
        throw new BadRequestException('该区已停用，不能新增占用');
      }
      if (slot.status === YardSlotStatus.OCCUPIED) {
        throw new BadRequestException('该库位已被占用');
      }
      if (slot.isLocked) {
        throw new BadRequestException('该库位已锁定，无法占用');
      }
      const existing = await slotRepo.findOne({
        where: { currentVin: vin, status: YardSlotStatus.OCCUPIED },
        relations: { zone: true },
      });
      if (existing && existing.id !== slotId) {
        throw new ConflictException(
          `VIN ${vin} 已占用其他库位 (${formatSlotCode(existing.zone.code, existing.line, existing.row)})，请先释放`,
        );
      }
      slot.status = YardSlotStatus.OCCUPIED;
      slot.currentVin = vin;
      slot.assignedAt = new Date();
      return slotToView(await slotRepo.save(slot));
    });
  }

  // 释放库位 = 撤销入库/纠错场景（详见旧注释）
  async releaseSlot(
    slotId: string,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<SlotView> {
    const scopedSlot = await this.slotsRepository.findOne({ where: { id: slotId } });
    if (!scopedSlot) throw new NotFoundException('库位不存在');
    await this.findOne(scopedSlot.yardId, scope);
    const result = await this.dataSource.transaction(async (mgr) => {
      const slotRepo = mgr.getRepository(YardSlot);
      const orderVinRepo = mgr.getRepository(OrderVin);
      const slot = await slotRepo
        .createQueryBuilder('slot')
        .innerJoinAndSelect('slot.zone', 'zone')
        .where('slot.id = :slotId', { slotId })
        .setLock('pessimistic_write', undefined, ['slot'])
        .getOne();
      if (!slot) throw new NotFoundException('库位不存在');

      const releasedVin = slot.currentVin;
      let affectedOrderId: string | null = null;

      if (releasedVin) {
        const orderVin = await orderVinRepo.findOne({
          where: { vin: releasedVin },
        });
        if (orderVin && orderVin.slotId === slotId) {
          affectedOrderId = orderVin.orderId;
          orderVin.arrivalStatus = OrderVinArrivalStatus.EXPECTED;
          orderVin.arrivedAt = null;
          orderVin.arrivedByUserId = null;
          orderVin.slotId = null;
          orderVin.arrivalPhotoUrls = null;
          orderVin.vehicleCheckInfo = null;
          orderVin.arrivalRemark = null;
          orderVin.inboundBatchId = null;
          await orderVinRepo.save(orderVin);
        }
      }

      slot.status = YardSlotStatus.VACANT;
      slot.currentVin = null;
      slot.assignedAt = null;
      const saved = await slotRepo.save(slot);
      saved.zone = slot.zone;
      const view = slotToView(saved);
      return { view, releasedVin, affectedOrderId };
    });

    if (result.releasedVin) {
      await this.audit.log({
        operationType: OperationType.INBOUND_UNDO,
        orderId: result.affectedOrderId,
        vin: result.releasedVin,
        yardId: result.view.yardId,
        slotId: result.view.id,
        operatorUserId,
        payload: {
          slotCode: formatSlotCode(
            result.view.zoneCode,
            result.view.line,
            result.view.row,
          ),
        },
      });
    }
    return result.view;
  }

  // 场内移位
  async moveSlot(
    fromSlotId: string,
    toSlotId: string,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{ from: SlotView; to: SlotView }> {
    if (fromSlotId === toSlotId) {
      throw new BadRequestException('源库位与目标库位相同');
    }
    const source = await this.slotsRepository.findOne({ where: { id: fromSlotId } });
    if (!source) throw new NotFoundException('源库位不存在');
    await this.findOne(source.yardId, scope);
    const result = await this.dataSource.transaction(async (mgr) => {
      const slotRepo = mgr.getRepository(YardSlot);
      const locked = await slotRepo
        .createQueryBuilder('slot')
        .innerJoinAndSelect('slot.zone', 'zone')
        .where('slot.id IN (:...ids)', { ids: [fromSlotId, toSlotId] })
        .orderBy('slot.id', 'ASC')
        .setLock('pessimistic_write', undefined, ['slot'])
        .getMany();
      const from = locked.find((slot) => slot.id === fromSlotId);
      const to = locked.find((slot) => slot.id === toSlotId);
      if (!from) throw new NotFoundException('源库位不存在');
      if (!to) throw new NotFoundException('目标库位不存在');
      if (from.yardId !== to.yardId) throw new BadRequestException('场内移位不能跨场地');
      if (from.status !== YardSlotStatus.OCCUPIED || !from.currentVin) {
        throw new BadRequestException('源库位当前无车');
      }
      if (to.status === YardSlotStatus.OCCUPIED) throw new BadRequestException('目标库位已占用');
      if (to.isLocked) throw new BadRequestException('目标库位已锁定');
      if (!to.zone.isActive) throw new BadRequestException('目标区已停用，不能移入');
      const vin = from.currentVin;
      to.status = YardSlotStatus.OCCUPIED;
      to.currentVin = vin;
      to.assignedAt = from.assignedAt;
      from.status = YardSlotStatus.VACANT;
      from.currentVin = null;
      from.assignedAt = null;
      await slotRepo.save([from, to]);
      await mgr.getRepository(OrderVin).update(
        { vin, slotId: fromSlotId },
        { slotId: toSlotId },
      );
      return { vin, fromView: slotToView(from), toView: slotToView(to) };
    });
    const { vin, fromView, toView } = result;
    await this.audit.log({
      operationType: OperationType.YARD_MOVE,
      vin,
      yardId: fromView.yardId,
      slotId: toView.id,
      operatorUserId,
      payload: {
        fromSlotId: fromView.id,
        fromSlotCode: formatSlotCode(fromView.zoneCode, fromView.line, fromView.row),
        toSlotId: toView.id,
        toSlotCode: formatSlotCode(toView.zoneCode, toView.line, toView.row),
      },
    });
    return { from: fromView, to: toView };
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
    const rawOrder: 'ASC' | 'DESC' = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const { sortColumn, sortOrder } = ((): {
      sortColumn: string;
      sortOrder: 'ASC' | 'DESC';
    } => {
      if (sortKey === 'stayDays') {
        return {
          sortColumn: 'slot.assigned_at',
          sortOrder: rawOrder === 'DESC' ? 'ASC' : 'DESC',
        };
      }
      // slotCode 组合排序：zone.code, line, row
      if (sortKey === 'slotCode')
        return { sortColumn: 'zone.code', sortOrder: rawOrder };
      if (sortKey === 'yardName')
        return { sortColumn: 'yard.name', sortOrder: rawOrder };
      return { sortColumn: 'slot.assigned_at', sortOrder: rawOrder };
    })();

    const applyFilters = (qb: SelectQueryBuilder<YardSlot>) => {
      qb.where('slot.status = :status', { status: YardSlotStatus.OCCUPIED })
        .andWhere('yard.organization_id IN (:...orgIds)', { orgIds });
      if (filters.vin) {
        qb.andWhere('slot.currentVin ILIKE :vin', { vin: `%${filters.vin}%` });
      }
      if (filters.yardId) {
        qb.andWhere('yard.id = :yardId', { yardId: filters.yardId });
      }
      if (filters.slotCode) {
        // slotCode 现在是拼接的：用户可能输入 "AB6-01" 或完整 "AB6-01-07"
        // 简化实现：ILIKE 匹配 zone.code；完整解析交给前端优化
        qb.andWhere(
          `(${slotDisplayCodeSql('slot', 'zone')}) ILIKE :slotCode`,
          { slotCode: `%${filters.slotCode}%` },
        );
      }
      if (filters.orderCode) {
        qb.andWhere('ord."orderCode" ILIKE :orderCode', {
          orderCode: `%${filters.orderCode}%`,
        });
      }
      if (filters.dateFrom) {
        qb.andWhere('slot.assigned_at >= :dateFrom', {
          dateFrom: filters.dateFrom,
        });
      }
      if (filters.dateTo) {
        qb.andWhere('slot.assigned_at <= :dateTo', {
          dateTo: filters.dateTo,
        });
      }
      if (filters.minStayDays && filters.minStayDays > 0) {
        qb.andWhere(
          `slot.assigned_at <= NOW() - INTERVAL '${Math.floor(filters.minStayDays)} day'`,
        );
      }
      if (scope.role === Role.YARD_STAFF && scope.scopeYardId) {
        qb.andWhere('yard.id = :yardStaffYardId', {
          yardStaffYardId: scope.scopeYardId,
        });
      }
    };

    const countQb = this.slotsRepository
      .createQueryBuilder('slot')
      .innerJoin('slot.yard', 'yard')
      .innerJoin('slot.zone', 'zone')
      .leftJoin('order_vins', 'ov', 'ov.vin = slot.currentVin')
      .leftJoin('orders', 'ord', 'ord.id = ov.order_id');
    applyFilters(countQb);
    const total = await countQb.getCount();
    if (filters.all && total > EXPORT_MAX_ROWS) {
      throw new ForbiddenException(
        `导出结果 ${total} 条超过上限 ${EXPORT_MAX_ROWS}，请缩短时间范围或加过滤条件`,
      );
    }

    const qb = this.slotsRepository
      .createQueryBuilder('slot')
      .innerJoin('slot.yard', 'yard')
      .innerJoin('slot.zone', 'zone')
      .leftJoin('order_vins', 'ov', 'ov.vin = slot.currentVin')
      .leftJoin('orders', 'ord', 'ord.id = ov.order_id')
      .select([
        'slot.id AS "slotId"',
        'zone.code AS "zoneCode"',
        'slot."line" AS "line"',
        'slot."row" AS "row"',
        'slot.currentVin AS "vin"',
        'slot.assigned_at AS "assignedAt"',
        'yard.id AS "yardId"',
        'yard.code AS "yardCode"',
        'yard.name AS "yardName"',
        'yard.organization_id AS "organizationId"',
        'ov.model AS "model"',
        'ov.color AS "color"',
        'ov."vehicleType" AS "vehicleType"',
        'ord."orderCode" AS "orderCode"',
      ])
      .orderBy(sortColumn, sortOrder, 'NULLS LAST');
    if (sortKey === 'slotCode') {
      qb.addOrderBy('slot."line"', sortOrder)
        .addOrderBy('slot."row"', sortOrder);
    }
    qb.addOrderBy('slot.id', 'DESC');
    applyFilters(qb);
    if (!filters.all) {
      qb.offset((page - 1) * pageSize).limit(pageSize);
    }
    const rows = await qb.getRawMany<{
      slotId: string;
      zoneCode: string;
      line: number;
      row: number;
      vin: string;
      assignedAt: Date | null;
      yardId: string;
      yardCode: string;
      yardName: string;
      organizationId: string;
      model: string | null;
      color: string | null;
      vehicleType: string | null;
      orderCode: string | null;
    }>();

    const now = Date.now();
    const items = rows.map((r) => {
      const stayDays = r.assignedAt
        ? Math.floor((now - new Date(r.assignedAt).getTime()) / 86400000)
        : 0;
      const line = Number(r.line);
      const row = Number(r.row);
      return {
        vin: r.vin,
        yardId: r.yardId,
        yardCode: r.yardCode,
        yardName: r.yardName,
        organizationId: r.organizationId,
        slotId: r.slotId,
        slotCode: formatSlotCode(r.zoneCode, line, row),
        zoneCode: r.zoneCode,
        line,
        row,
        assignedAt: r.assignedAt,
        stayDays,
        model: r.model,
        color: r.color,
        vehicleType: r.vehicleType,
        orderCode: r.orderCode,
      } satisfies VinInventoryRow;
    });
    return { items, total, page, pageSize };
  }

  findByIdUnscoped(id: string): Promise<Yard | null> {
    return this.yardsRepository.findOne({ where: { id } });
  }

  // VIN 全生命周期
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
      if (scope.type === 'ORG' && !scope.orgIds.includes(orderVin.order.organizationId)) {
        throw new NotFoundException('VIN 不存在');
      }
      if (scope.type === 'CUSTOMER' && orderVin.order.customerId !== scope.customerId) {
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

    return {
      vin,
      orderVin,
      waybills: waybillVins.map((wv) => wv.waybill).filter(Boolean),
      events,
    };
  }

  // 批量库位分配（初始化 / 大规模移位）
  // 每行 slotCode 是"AB6-01-07"字符串；先解析→查 zone→定位 slot
  async batchAssignSlots(
    yardId: string,
    items: Array<{ vin: string; slotCode: string }>,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{
    total: number;
    succeeded: number;
    skipped: Array<{ vin: string; reason: string }>;
    failed: Array<{ vin: string; slotCode: string; reason: string }>;
  }> {
    const yard = await this.yardsRepository.findOne({ where: { id: yardId } });
    if (!yard) throw new NotFoundException('目标场地不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);
    if (
      scope.type === 'ORG' &&
      scope.role === Role.YARD_STAFF &&
      scope.scopeYardId &&
      scope.scopeYardId !== yardId
    ) {
      throw new ForbiddenException('仅本场地作业员可分配此场地库位');
    }

    const seen = new Set<string>();
    const uniqueItems: typeof items = [];
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const key = items[i].vin.trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueItems.unshift({ ...items[i], vin: key });
    }

    const skipped: Array<{ vin: string; reason: string }> = [];
    const failed: Array<{ vin: string; slotCode: string; reason: string }> = [];
    let succeeded = 0;

    for (const row of uniqueItems) {
      try {
        const parsed = parseSlotCode(row.slotCode);
        if (!parsed) {
          failed.push({
            vin: row.vin,
            slotCode: row.slotCode,
            reason: `库位码格式错误：期望 zoneCode-NN-NN`,
          });
          continue;
        }

        const moveResult = await this.dataSource.transaction(async (mgr) => {
          const vinRepo = mgr.getRepository(OrderVin);
          const slotRepo = mgr.getRepository(YardSlot);
          const zoneRepo = mgr.getRepository(YardZone);

          const orderVin = await vinRepo.findOne({ where: { vin: row.vin } });
          if (!orderVin) return { skip: 'VIN 未在系统中' };
          if (orderVin.arrivalStatus === OrderVinArrivalStatus.CANCELLED) {
            return { skip: 'VIN 已取消' };
          }

          const zone = await zoneRepo.findOne({
            where: { yardId, code: parsed.zoneCode },
          });
          if (!zone) {
            return { fail: `此场地不存在区 ${parsed.zoneCode}` };
          }
          if (!zone.isActive) {
            return { fail: `区 ${parsed.zoneCode} 已停用，不能分配库位` };
          }
          const targetSlot = await slotRepo.findOne({
            where: {
              yardId,
              zoneId: zone.id,
              line: parsed.line,
              row: parsed.row,
            },
          });
          if (!targetSlot) {
            return { fail: `目标库位 ${row.slotCode} 未生成，请先在库位配置生成` };
          }
          if (targetSlot.isLocked) {
            return { fail: `目标库位 ${row.slotCode} 已锁定` };
          }
          if (
            targetSlot.status === YardSlotStatus.OCCUPIED &&
            targetSlot.currentVin !== row.vin
          ) {
            return {
              fail: `目标库位 ${row.slotCode} 已被 ${targetSlot.currentVin} 占用`,
            };
          }

          if (orderVin.slotId === targetSlot.id) {
            return { skip: '已在目标库位' };
          }

          if (orderVin.slotId) {
            const oldSlot = await slotRepo.findOne({
              where: { id: orderVin.slotId },
            });
            if (oldSlot && oldSlot.currentVin === row.vin) {
              oldSlot.status = YardSlotStatus.VACANT;
              oldSlot.currentVin = null;
              oldSlot.assignedAt = null;
              await slotRepo.save(oldSlot);
            }
          }

          targetSlot.status = YardSlotStatus.OCCUPIED;
          targetSlot.currentVin = row.vin;
          targetSlot.assignedAt = new Date();
          await slotRepo.save(targetSlot);

          const wasExpected =
            orderVin.arrivalStatus === OrderVinArrivalStatus.EXPECTED;
          orderVin.slotId = targetSlot.id;
          if (wasExpected) {
            orderVin.arrivalStatus = OrderVinArrivalStatus.ARRIVED;
            orderVin.arrivedAt = new Date();
            orderVin.arrivedByUserId = operatorUserId ?? null;
          }
          await vinRepo.save(orderVin);

          return {
            success: {
              orderId: orderVin.orderId,
              slotId: targetSlot.id,
              slotCode: row.slotCode,
              wasExpected,
            },
          };
        });

        if (moveResult.skip) {
          skipped.push({ vin: row.vin, reason: moveResult.skip });
        } else if (moveResult.fail) {
          failed.push({
            vin: row.vin,
            slotCode: row.slotCode,
            reason: moveResult.fail,
          });
        } else if (moveResult.success) {
          succeeded += 1;
          await this.audit.log({
            operationType: moveResult.success.wasExpected
              ? OperationType.INBOUND_SCAN
              : OperationType.YARD_MOVE,
            orderId: moveResult.success.orderId,
            vin: row.vin,
            yardId,
            slotId: moveResult.success.slotId,
            operatorUserId,
            payload: {
              slotCode: moveResult.success.slotCode,
              bulk: true,
            },
          });
        }
      } catch (err) {
        failed.push({
          vin: row.vin,
          slotCode: row.slotCode,
          reason: (err as Error).message ?? '未知错误',
        });
      }
    }

    return {
      total: uniqueItems.length,
      succeeded,
      skipped,
      failed,
    };
  }
}
