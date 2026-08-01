import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Yard } from './entities/yard.entity';
import { YardZone } from './entities/yard-zone.entity';
import { YardSlot, YardSlotStatus } from './entities/yard-slot.entity';
import {
  CreateYardZoneDto,
  UpdateYardZoneDto,
  GenerateSlotsByZoneDto,
} from './dto/create-yard-zone.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { Role } from '../../common/enums/role.enum';

export interface ZoneSummary {
  id: string;
  yardId: string;
  code: string;
  name: string | null;
  lineCount: number;
  rowCount: number;
  capacity: number; // lineCount * rowCount
  slotCount: number; // 实际生成的 slot 数
  occupiedCount: number;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Yard)
    private readonly yardsRepository: Repository<Yard>,
    @InjectRepository(YardZone)
    private readonly zonesRepository: Repository<YardZone>,
    @InjectRepository(YardSlot)
    private readonly slotsRepository: Repository<YardSlot>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  private async assertYardWritable(yardId: string, scope: EffectiveScope): Promise<Yard> {
    const yard = await this.yardsRepository.findOne({ where: { id: yardId } });
    if (!yard) throw new NotFoundException('场地不存在');
    this.scopeService.assertOrgWritable(scope, yard.organizationId);
    if (
      scope.type === 'ORG' &&
      scope.role === Role.YARD_STAFF &&
      scope.scopeYardId &&
      scope.scopeYardId !== yardId
    ) {
      throw new ForbiddenException('仅可访问当前绑定场地');
    }
    return yard;
  }

  async list(yardId: string, scope: EffectiveScope): Promise<ZoneSummary[]> {
    await this.assertYardWritable(yardId, scope);
    const zones = await this.zonesRepository.find({
      where: { yardId },
      order: { code: 'ASC' },
    });
    if (zones.length === 0) return [];
    const raws: Array<{ zone_id: string; slot_count: string; occupied: string }> =
      await this.slotsRepository
        .createQueryBuilder('slot')
        .select('slot.zone_id', 'zone_id')
        .addSelect('COUNT(*)', 'slot_count')
        .addSelect(
          `COUNT(*) FILTER (WHERE slot.status = '${YardSlotStatus.OCCUPIED}')`,
          'occupied',
        )
        .where('slot.zone_id IN (:...ids)', { ids: zones.map((z) => z.id) })
        .groupBy('slot.zone_id')
        .getRawMany();
    const statsByZone = new Map(
      raws.map((r) => [r.zone_id, {
        slotCount: Number(r.slot_count),
        occupiedCount: Number(r.occupied),
      }]),
    );
    return zones.map((z) => {
      const stat = statsByZone.get(z.id) ?? { slotCount: 0, occupiedCount: 0 };
      return {
        id: z.id,
        yardId: z.yardId,
        code: z.code,
        name: z.name,
        lineCount: z.lineCount,
        rowCount: z.rowCount,
        capacity: z.lineCount * z.rowCount,
        slotCount: stat.slotCount,
        occupiedCount: stat.occupiedCount,
        isActive: z.isActive,
        createdAt: z.createdAt,
      };
    });
  }

  async create(
    yardId: string,
    dto: CreateYardZoneDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<YardZone> {
    await this.assertYardWritable(yardId, scope);
    const code = dto.code.trim().toUpperCase();
    const existing = await this.zonesRepository.findOne({
      where: { yardId, code },
    });
    if (existing) throw new ConflictException(`区 ${code} 已存在`);
    const zone = this.zonesRepository.create({
      yardId,
      code,
      name: dto.name ?? null,
      lineCount: dto.lineCount,
      rowCount: dto.rowCount,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.zonesRepository.save(zone);
    await this.audit.log({
      operationType: OperationType.YARD_ZONE_CREATE,
      operatorUserId,
      yardId,
      payload: {
        zoneId: saved.id,
        code: saved.code,
        lineCount: saved.lineCount,
        rowCount: saved.rowCount,
      },
    });
    return saved;
  }

  async update(
    yardId: string,
    zoneId: string,
    dto: UpdateYardZoneDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<YardZone> {
    await this.assertYardWritable(yardId, scope);
    const zone = await this.zonesRepository.findOne({
      where: { id: zoneId, yardId },
    });
    if (!zone) throw new NotFoundException('区不存在');
    const before = {
      code: zone.code,
      name: zone.name,
      isActive: zone.isActive,
      lineCount: zone.lineCount,
      rowCount: zone.rowCount,
    };
    if (dto.code !== undefined && dto.code !== zone.code) {
      const code = dto.code.trim().toUpperCase();
      const clash = await this.zonesRepository.findOne({
        where: { yardId, code },
      });
      if (clash && clash.id !== zone.id) {
        throw new ConflictException(`区 ${code} 已存在`);
      }
      zone.code = code;
    }
    if (dto.name !== undefined) zone.name = dto.name ?? null;
    if (dto.isActive !== undefined) zone.isActive = dto.isActive;
    const nextLineCount = dto.lineCount ?? zone.lineCount;
    const nextRowCount = dto.rowCount ?? zone.rowCount;
    const shrinking = nextLineCount < zone.lineCount || nextRowCount < zone.rowCount;
    if (shrinking) {
      const outsideSlots = await this.slotsRepository
        .createQueryBuilder('slot')
        .where('slot.zone_id = :zoneId', { zoneId })
        .andWhere('(slot.line > :lineCount OR slot.row > :rowCount)', {
          lineCount: nextLineCount,
          rowCount: nextRowCount,
        })
        .getMany();
      const blocked = outsideSlots.filter(
        (slot) => slot.status === YardSlotStatus.OCCUPIED || slot.isLocked,
      ).length;
      if (blocked > 0) {
        throw new BadRequestException(
          `缩容范围外还有 ${blocked} 个占用/锁定库位，请先处理`,
        );
      }
      if (outsideSlots.length > 0) {
        await this.slotsRepository.delete({ id: In(outsideSlots.map((slot) => slot.id)) });
      }
    }
    zone.lineCount = nextLineCount;
    zone.rowCount = nextRowCount;
    const saved = await this.zonesRepository.save(zone);
    await this.audit.log({
      operationType: OperationType.YARD_ZONE_UPDATE,
      operatorUserId,
      yardId,
      payload: { zoneId, before, patch: dto },
    });
    return saved;
  }

  // 删除 Zone：只允许区内所有 slot 都 VACANT & 未锁定时删除
  async remove(
    yardId: string,
    zoneId: string,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{ ok: true; deletedSlots: number }> {
    await this.assertYardWritable(yardId, scope);
    const zone = await this.zonesRepository.findOne({
      where: { id: zoneId, yardId },
    });
    if (!zone) throw new NotFoundException('区不存在');
    const occupied = await this.slotsRepository.count({
      where: [
        { zoneId, status: YardSlotStatus.OCCUPIED },
        { zoneId, isLocked: true },
      ],
    });
    if (occupied > 0) {
      throw new BadRequestException(
        `区 ${zone.code} 内还有 ${occupied} 个占用/锁定库位，请先清空`,
      );
    }
    const deletedSlots = await this.slotsRepository.count({ where: { zoneId } });
    // 事务里删 slot 再删 zone；FK ON DELETE CASCADE 也可以但显式更清晰
    await this.dataSource.transaction(async (mgr) => {
      await mgr.getRepository(YardSlot).delete({ zoneId });
      await mgr.getRepository(YardZone).delete(zoneId);
    });
    await this.audit.log({
      operationType: OperationType.YARD_ZONE_DELETE,
      operatorUserId,
      yardId,
      payload: { zoneId, code: zone.code, deletedSlots },
    });
    return { ok: true, deletedSlots };
  }

  // 按 Zone 尺寸批量生成/同步 slot：
  //   - 幂等：(zoneId, line, row) 已存在则 skip
  //   - 默认按 zone.lineCount × zone.rowCount 全量填充
  //   - 可传 fromLine/toLine/toRow 仅生成子集（增量扩排）
  async generateSlots(
    yardId: string,
    zoneId: string,
    dto: GenerateSlotsByZoneDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{ created: number; skipped: number }> {
    await this.assertYardWritable(yardId, scope);
    const zone = await this.zonesRepository.findOne({
      where: { id: zoneId, yardId },
    });
    if (!zone) throw new NotFoundException('区不存在');
    const fromLine = Math.max(1, dto.fromLine ?? 1);
    const toLine = Math.max(fromLine, dto.toLine ?? zone.lineCount);
    const toRow = Math.max(1, dto.toRow ?? zone.rowCount);
    if (toLine > zone.lineCount) {
      throw new BadRequestException(
        `toLine ${toLine} 超出 zone.lineCount ${zone.lineCount}`,
      );
    }
    if (toRow > zone.rowCount) {
      throw new BadRequestException(
        `toRow ${toRow} 超出 zone.rowCount ${zone.rowCount}`,
      );
    }
    const targetPairs: Array<{ line: number; row: number }> = [];
    for (let l = fromLine; l <= toLine; l += 1) {
      for (let r = 1; r <= toRow; r += 1) {
        targetPairs.push({ line: l, row: r });
      }
    }
    if (targetPairs.length === 0) return { created: 0, skipped: 0 };
    let created = 0;
    const BATCH = 500;
    for (let i = 0; i < targetPairs.length; i += BATCH) {
      const values = targetPairs.slice(i, i + BATCH).map((p) => ({
        yardId,
        zoneId,
        line: p.line,
        row: p.row,
        status: YardSlotStatus.VACANT,
      }));
      const result = await this.slotsRepository
        .createQueryBuilder()
        .insert()
        .values(values)
        .orIgnore()
        .returning(['id'])
        .execute();
      created += result.identifiers.length;
    }
    await this.audit.log({
      operationType: OperationType.YARD_ZONE_GENERATE_SLOTS,
      operatorUserId,
      yardId,
      payload: {
        zoneId,
        code: zone.code,
        fromLine,
        toLine,
        toRow,
        created,
      },
    });
    return { created, skipped: targetPairs.length - created };
  }

  // 场地看板/入库扫描下拉：只返回 isActive 的 zones
  async listActiveForYard(yardId: string, scope: EffectiveScope): Promise<
    Array<{ id: string; code: string; name: string | null; lineCount: number; rowCount: number }>
  > {
    await this.assertYardWritable(yardId, scope);
    const zones = await this.zonesRepository.find({
      where: { yardId, isActive: true },
      order: { code: 'ASC' },
    });
    return zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      lineCount: z.lineCount,
      rowCount: z.rowCount,
    }));
  }
}

// 校验：Zone 是否可以（软）禁用 — 有占用 slot 拒绝，管理员可传 force
export class ZoneDeactivateOptions {
  force?: boolean;
}
