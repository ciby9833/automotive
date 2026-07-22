import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { Yard } from './entities/yard.entity';
import { YardSlot, YardSlotStatus } from './entities/yard-slot.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { WaybillVin } from '../waybills/entities/waybill-vin.entity';
import { WaybillStatusLog } from '../tracking/entities/waybill-status-log.entity';
import { CreateYardDto } from './dto/create-yard.dto';
import { CreateYardSlotDto } from './dto/create-yard-slot.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '../../common/enums/role.enum';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';

// VIN 库存查询返回结构（联表 order_vins 拿车型/颜色，未挂订单的 VIN 用 null）
export interface VinInventoryRow {
  vin: string;
  yardId: string;
  yardCode: string;
  yardName: string;
  organizationId: string;
  slotId: string;
  slotCode: string;
  assignedAt: Date | null;
  stayDays: number;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  orderCode: string | null;
}

@Injectable()
export class YardsService {
  constructor(
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

  async findSlots(yardId: string, scope: EffectiveScope): Promise<YardSlot[]> {
    await this.findOne(yardId, scope);
    return this.slotsRepository.find({
      where: { yardId },
      order: { code: 'ASC' },
    });
  }

  async createSlot(
    yardId: string,
    dto: CreateYardSlotDto,
    scope: EffectiveScope,
  ): Promise<YardSlot> {
    await this.findOne(yardId, scope);
    const slot = this.slotsRepository.create({ ...dto, yardId });
    return this.slotsRepository.save(slot);
  }

  // 批量创建：给"库位配置"页(Excel 导入 / 网格生成器)使用
  //   - 幂等：已存在的 code 跳过(不报错)，只插入新的；
  //   - 单次事务；上限 10000 条防呆。
  //   返回本次实际新增的数量 + 跳过(已存在)的数量
  async bulkCreateSlots(
    yardId: string,
    slotDtos: CreateYardSlotDto[],
    scope: EffectiveScope,
  ): Promise<{ created: number; skipped: number }> {
    await this.findOne(yardId, scope);
    if (slotDtos.length === 0) return { created: 0, skipped: 0 };
    if (slotDtos.length > 10000) {
      throw new BadRequestException('单次批量创建上限 10000 条');
    }
    // 去重入参本身
    const seenCodes = new Set<string>();
    const uniqueDtos = slotDtos.filter((d) => {
      if (seenCodes.has(d.code)) return false;
      seenCodes.add(d.code);
      return true;
    });
    const codes = uniqueDtos.map((d) => d.code);
    const existing = await this.slotsRepository.find({
      where: { yardId, code: In(codes) },
      select: { code: true },
    });
    const existingSet = new Set(existing.map((e) => e.code));
    const toInsert = uniqueDtos.filter((d) => !existingSet.has(d.code));
    if (toInsert.length === 0) {
      return { created: 0, skipped: uniqueDtos.length };
    }
    const entities = toInsert.map((d) =>
      this.slotsRepository.create({ ...d, yardId }),
    );
    await this.slotsRepository.save(entities);
    return {
      created: entities.length,
      skipped: uniqueDtos.length - entities.length,
    };
  }

  // 批量删除：给库位配置页使用；只能删空置库位，避免误删有车的位
  async bulkDeleteSlots(
    yardId: string,
    slotIds: string[],
    scope: EffectiveScope,
  ): Promise<{ deleted: number; blocked: number }> {
    await this.findOne(yardId, scope);
    if (slotIds.length === 0) return { deleted: 0, blocked: 0 };
    const slots = await this.slotsRepository.find({
      where: { id: In(slotIds), yardId },
    });
    const deletable = slots.filter((s) => s.status === YardSlotStatus.VACANT);
    const blocked = slots.length - deletable.length;
    if (deletable.length > 0) {
      await this.slotsRepository.delete(deletable.map((s) => s.id));
    }
    return { deleted: deletable.length, blocked };
  }

  async yardStats(yardId: string, scope: EffectiveScope) {
    const slots = await this.findSlots(yardId, scope);
    const occupied = slots.filter(
      (s) => s.status === YardSlotStatus.OCCUPIED,
    ).length;
    return { total: slots.length, occupied, vacant: slots.length - occupied };
  }

  // VIN 是否已在其他库位占用；避免同一 VIN 同时"在 A-1 又在 B-3"
  private async assertVinNotDoubleParked(
    vin: string,
    excludeSlotId?: string,
  ): Promise<void> {
    const existing = await this.slotsRepository.findOne({
      where: { currentVin: vin, status: YardSlotStatus.OCCUPIED },
    });
    if (existing && existing.id !== excludeSlotId) {
      throw new ConflictException(
        `VIN ${vin} 已占用其他库位 (${existing.code})，请先释放`,
      );
    }
  }

  async assignSlot(slotId: string, vin: string): Promise<YardSlot> {
    const slot = await this.slotsRepository.findOne({ where: { id: slotId } });
    if (!slot) throw new NotFoundException('库位不存在');
    if (slot.status === YardSlotStatus.OCCUPIED) {
      throw new BadRequestException('该库位已被占用');
    }
    if (slot.isLocked) {
      throw new BadRequestException('该库位已锁定，无法占用');
    }
    await this.assertVinNotDoubleParked(vin);
    slot.status = YardSlotStatus.OCCUPIED;
    slot.currentVin = vin;
    slot.assignedAt = new Date();
    return this.slotsRepository.save(slot);
  }

  // 释放库位 = 撤销入库/纠错场景：车物理还在或者需要重扫，业务上"这次入库不算数"
  // 事务里同时：
  //   1) 清空 slot (VACANT + currentVin=null)
  //   2) 关联的 OrderVin 回滚到 EXPECTED (清 arrivedAt / slotId / 存证)
  //      这样入库订单里那条 VIN 又回到 "待到货"，可以重新走入库扫码
  // 非 OrderVin 挂载的手动占用 (assignSlot 直接开的 currentVin) 只清 slot 表
  //
  // 注意：车真的离开场地(出库)应该走 /waybills/scan(DELIVERY_DEPARTURE)，
  // 不走这个接口 —— 那条路径会释放 slot 但保留 arrival 记录、走财务和运单闭环
  async releaseSlot(slotId: string, operatorUserId?: string): Promise<YardSlot> {
    const result = await this.dataSource.transaction(async (mgr) => {
      const slotRepo = mgr.getRepository(YardSlot);
      const orderVinRepo = mgr.getRepository(OrderVin);
      const slot = await slotRepo.findOne({ where: { id: slotId } });
      if (!slot) throw new NotFoundException('库位不存在');

      const releasedVin = slot.currentVin;
      let affectedOrderId: string | null = null;

      // OrderVin 回滚
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
      return { saved, releasedVin, affectedOrderId, slotCode: slot.code };
    });

    if (result.releasedVin) {
      await this.audit.log({
        operationType: OperationType.INBOUND_UNDO,
        orderId: result.affectedOrderId,
        vin: result.releasedVin,
        operatorUserId,
        payload: { slotCode: result.slotCode },
      });
    }
    return result.saved;
  }

  // 场内移位：一次动作从 fromSlot 移到 toSlot(必须 VACANT+未锁定)
  async moveSlot(
    fromSlotId: string,
    toSlotId: string,
    operatorUserId?: string,
  ): Promise<{ from: YardSlot; to: YardSlot }> {
    if (fromSlotId === toSlotId) {
      throw new BadRequestException('源库位与目标库位相同');
    }
    const [from, to] = await Promise.all([
      this.slotsRepository.findOne({ where: { id: fromSlotId } }),
      this.slotsRepository.findOne({ where: { id: toSlotId } }),
    ]);
    if (!from) throw new NotFoundException('源库位不存在');
    if (!to) throw new NotFoundException('目标库位不存在');
    if (from.yardId !== to.yardId) {
      throw new BadRequestException('场内移位不能跨场地');
    }
    if (from.status !== YardSlotStatus.OCCUPIED || !from.currentVin) {
      throw new BadRequestException('源库位当前无车');
    }
    if (to.status === YardSlotStatus.OCCUPIED) {
      throw new BadRequestException('目标库位已占用');
    }
    if (to.isLocked) {
      throw new BadRequestException('目标库位已锁定');
    }
    const vin = from.currentVin;
    const assignedAt = from.assignedAt; // 保留原停放时间，移位不重置车龄
    from.status = YardSlotStatus.VACANT;
    from.currentVin = null;
    from.assignedAt = null;
    to.status = YardSlotStatus.OCCUPIED;
    to.currentVin = vin;
    to.assignedAt = assignedAt;
    const [savedFrom, savedTo] = await Promise.all([
      this.slotsRepository.save(from),
      this.slotsRepository.save(to),
    ]);
    await this.audit.log({
      operationType: OperationType.YARD_MOVE,
      vin,
      operatorUserId,
      payload: {
        fromSlotCode: from.code,
        toSlotCode: to.code,
        yardId: from.yardId,
      },
    });
    return { from: savedFrom, to: savedTo };
  }

  // VIN 库存查询：主视图是"这辆车在哪、几天了、什么车型、哪张订单"
  //   联表 order_vins 拿车型/颜色/订单号，未匹配的 VIN 保留 null。
  //   scope 过滤：走 yard.organization_id 在 scope.orgIds 内的库位。
  async vinInventory(
    scope: EffectiveScope,
    filters: {
      vin?: string;
      organizationId?: string;
      yardId?: string;
      minStayDays?: number;
    },
  ): Promise<VinInventoryRow[]> {
    if (scope.type !== 'ORG') {
      // CARRIER / CUSTOMER 的 VIN 库存 P0 阶段暂不支持——他们的口径不同
      // (客户看的是"我下单的 VIN 到了哪个仓"，承运商看的是"我要提的 VIN 现在哪儿")；
      // 这些视角要专门的接口，不套用内部 scope。
      return [];
    }
    const qb = this.slotsRepository
      .createQueryBuilder('slot')
      .innerJoin('slot.yard', 'yard')
      .leftJoin('order_vins', 'ov', 'ov.vin = slot.currentVin')
      .leftJoin('orders', 'ord', 'ord.id = ov.order_id')
      .where('slot.status = :status', { status: YardSlotStatus.OCCUPIED })
      .andWhere('yard.organization_id IN (:...orgIds)', {
        orgIds: filters.organizationId
          ? [filters.organizationId]
          : scope.orgIds,
      })
      .select([
        'slot.id AS "slotId"',
        'slot.code AS "slotCode"',
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
      .orderBy('slot.assigned_at', 'DESC', 'NULLS LAST');
    if (filters.vin) {
      qb.andWhere('slot.currentVin ILIKE :vin', { vin: `%${filters.vin}%` });
    }
    if (filters.yardId) {
      qb.andWhere('yard.id = :yardId', { yardId: filters.yardId });
    }
    if (scope.role === Role.YARD_STAFF && scope.scopeYardId) {
      qb.andWhere('yard.id = :yardStaffYardId', {
        yardStaffYardId: scope.scopeYardId,
      });
    }
    const rows = await qb.getRawMany<{
      slotId: string;
      slotCode: string;
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
    return rows
      .map((r) => {
        const stayDays = r.assignedAt
          ? Math.floor((now - new Date(r.assignedAt).getTime()) / 86400000)
          : 0;
        if (filters.minStayDays && stayDays < filters.minStayDays) return null;
        return {
          vin: r.vin,
          yardId: r.yardId,
          yardCode: r.yardCode,
          yardName: r.yardName,
          organizationId: r.organizationId,
          slotId: r.slotId,
          slotCode: r.slotCode,
          assignedAt: r.assignedAt,
          stayDays,
          model: r.model,
          color: r.color,
          vehicleType: r.vehicleType,
          orderCode: r.orderCode,
        } satisfies VinInventoryRow;
      })
      .filter((r): r is VinInventoryRow => r !== null);
  }

  findByIdUnscoped(id: string): Promise<Yard | null> {
    return this.yardsRepository.findOne({ where: { id } });
  }

  // ============ VIN 全生命周期查询 ============
  // 给场地看板抽屉 / VIN 详情页 / 客服追溯用：一个接口把 VIN 的所有信息拿完
  // 数据来源：
  //   1. OrderVin: pickup* + arrival* + 入库单关联
  //   2. WaybillVin: 该 VIN 挂过的所有出库运单
  //   3. WaybillStatusLog: 所有扫码/状态变更事件（时间倒序）
  async getVinLifecycle(vin: string, scope: EffectiveScope) {
    // OrderVin 关联入库单 + 客户 + 场地 + 提货信息
    const orderVin = await this.orderVinsRepository.findOne({
      where: { vin },
      relations: {
        order: { customer: true, destinationYard: true },
        pickupCarrier: true,
        pickupDriverUser: true,
        arrivedByUser: true,
        slot: { yard: true },
        inboundBatch: true,
      },
    });

    // scope 校验：内部按 org、客户按 customerId
    if (orderVin?.order) {
      if (scope.type === 'ORG' && !scope.orgIds.includes(orderVin.order.organizationId)) {
        throw new NotFoundException('VIN 不存在');
      }
      if (scope.type === 'CUSTOMER' && orderVin.order.customerId !== scope.customerId) {
        throw new NotFoundException('VIN 不存在');
      }
    }

    // 出库运单（可能多次调拨或重新开单）
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

    // 事件流水：时间倒序
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

  // 批量库位分配：go-live 初始化 / 大规模移位
  // 语义：把 (VIN, targetSlotCode) 逐条落库。VIN 已 ARRIVED 时释放旧 slot；EXPECTED 时置 ARRIVED
  // 失败按行汇总原因返回，不阻塞整批 (一致性交给业务员按结果人工纠错)
  // 事务粒度：每行一个事务；避免一整批因单行冲突全 rollback
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

    // 行内去重：同一 VIN 只保留最后一行
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
        const moveResult = await this.dataSource.transaction(async (mgr) => {
          const vinRepo = mgr.getRepository(OrderVin);
          const slotRepo = mgr.getRepository(YardSlot);

          const orderVin = await vinRepo.findOne({ where: { vin: row.vin } });
          if (!orderVin) return { skip: 'VIN 未在系统中' };
          if (orderVin.arrivalStatus === OrderVinArrivalStatus.CANCELLED) {
            return { skip: 'VIN 已取消' };
          }

          const targetSlot = await slotRepo.findOne({
            where: { code: row.slotCode, yardId },
          });
          if (!targetSlot) {
            return { fail: `目标库位 ${row.slotCode} 不在此场地` };
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

          // 幂等：VIN 已在这个 slot → 直接 skip
          if (orderVin.slotId === targetSlot.id) {
            return { skip: '已在目标库位' };
          }

          // 释放旧 slot (如果有)
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

          // 占目标 slot + 更新 VIN
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
              slotCode: targetSlot.code,
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
          // 事务外记审计：EXPECTED→ARRIVED 视同 INBOUND_SCAN；已 ARRIVED 视同 YARD_MOVE
          await this.audit.log({
            operationType: moveResult.success.wasExpected
              ? OperationType.INBOUND_SCAN
              : OperationType.YARD_MOVE,
            orderId: moveResult.success.orderId,
            vin: row.vin,
            operatorUserId,
            payload: {
              slotCode: moveResult.success.slotCode,
              yardId,
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
