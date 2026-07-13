import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Yard } from './entities/yard.entity';
import { YardSlot, YardSlotStatus } from './entities/yard-slot.entity';
import { CreateYardDto } from './dto/create-yard.dto';
import { CreateYardSlotDto } from './dto/create-yard-slot.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '../../common/enums/role.enum';

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
    private readonly scopeService: ScopeService,
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

  async releaseSlot(slotId: string): Promise<YardSlot> {
    const slot = await this.slotsRepository.findOne({ where: { id: slotId } });
    if (!slot) throw new NotFoundException('库位不存在');
    slot.status = YardSlotStatus.VACANT;
    slot.currentVin = null;
    slot.assignedAt = null;
    return this.slotsRepository.save(slot);
  }

  // 场内移位：一次动作从 fromSlot 移到 toSlot(必须 VACANT+未锁定)
  async moveSlot(
    fromSlotId: string,
    toSlotId: string,
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
}
