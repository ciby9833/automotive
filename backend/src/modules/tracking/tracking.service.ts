import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { WaybillStatusLog } from './entities/waybill-status-log.entity';
import { OperationLog } from './entities/operation-log.entity';
import { DriverPosition } from './entities/driver-position.entity';
import { DriverPositionBatchDto } from './dto/driver-position-batch.dto';
import { OperationType } from '../../common/enums/operation-type.enum';
import { ScanAction } from '../../common/enums/waybill-status.enum';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import { EffectiveScope } from '../../common/scope/scope.types';
import { Order } from '../orders/entities/order.entity';
import { Waybill } from '../waybills/entities/waybill.entity';

// 归一化后的时间线节点：前端不需知道来源是哪张表。
// occurredAt 是权威事件时间（operation.event_at ?? created_at；scan 走 created_at）；
// createdAt 只作调试用途保留，用于展示"补录延迟"。
export interface TimelineEntry {
  source: 'operation' | 'waybill_scan';
  occurredAt: Date;
  createdAt: Date;
  type: OperationType | ScanAction;
  vin: string | null;
  orderId: string | null;
  waybillId: string | null;
  yard: { id: string; name: string; code: string } | null;
  slot: {
    id: string;
    line: number;
    row: number;
    zone: { id: string; code: string };
  } | null;
  operator: { id: string; displayName: string } | null;
  attachmentUrls: string[] | null;
  payload: Record<string, unknown> | null;
  remark: string | null;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectRepository(WaybillStatusLog)
    private readonly logsRepository: Repository<WaybillStatusLog>,
    @InjectRepository(OperationLog)
    private readonly opLogsRepository: Repository<OperationLog>,
    @InjectRepository(DriverPosition)
    private readonly driverPositionsRepository: Repository<DriverPosition>,
  ) {}

  async saveDriverPositionBatch(
    dto: DriverPositionBatchDto,
    user: AuthenticatedUser,
  ): Promise<{ accepted: number }> {
    if (user.role !== Role.CARRIER_DRIVER && user.role !== Role.CARRIER_STAFF) {
      throw new ForbiddenException('仅承运商账号可上报位置');
    }
    if (!user.carrierId) {
      throw new ForbiddenException('账号未绑定承运商');
    }

    for (const p of dto.positions) {
      if (p.waybillId) {
        const owned = await this.logsRepository.manager.findOneBy(Waybill, {
          id: p.waybillId,
          carrierId: user.carrierId,
        });
        if (!owned || (p.orderId && p.orderId !== owned.orderId))
          throw new ForbiddenException('位置关联的运单不属于当前承运商');
      }
      if (
        p.orderId &&
        !p.waybillId &&
        !(await this.logsRepository.manager.findOneBy(Order, {
          id: p.orderId,
          pickupCarrierId: user.carrierId,
        }))
      )
        throw new ForbiddenException('位置关联的提货订单不属于当前承运商');
      if (p.vin) {
        const [owned] = await this.logsRepository.query(
          `SELECT 1 FROM order_vins v JOIN orders o ON o.id=v.order_id
          WHERE v.vin=$1 AND o.pickup_carrier_id=$2 AND $4::uuid IS NULL AND ($3::uuid IS NULL OR o.id=$3)
          UNION ALL SELECT 1 FROM waybill_vins v JOIN waybills w ON w.id=v.waybill_id
          WHERE v.vin=$1 AND w.carrier_id=$2 AND ($4::uuid IS NULL OR w.id=$4)
            AND ($3::uuid IS NULL OR w.order_id=$3) LIMIT 1`,
          [p.vin, user.carrierId, p.orderId ?? null, p.waybillId ?? null],
        );
        if (!owned)
          throw new ForbiddenException('位置关联的 VIN 不属于当前运输任务');
      }
    }

    const rows = dto.positions.map((p) =>
      this.driverPositionsRepository.create({
        capturedAt: new Date(p.capturedAt),
        driverUserId: user.userId,
        carrierId: user.carrierId,
        waybillId: p.waybillId ?? null,
        orderId: p.orderId ?? null,
        vin: p.vin ?? null,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy ?? null,
        speed: p.speed ?? null,
        heading: p.heading ?? null,
        batteryLevel: p.batteryLevel ?? null,
        isCharging: p.isCharging ?? null,
        source: p.source ?? 'app',
      }),
    );
    await this.driverPositionsRepository.save(rows, { chunk: 200 });
    return { accepted: rows.length };
  }

  async appendLog(
    data: Partial<WaybillStatusLog>,
    manager: EntityManager,
  ): Promise<WaybillStatusLog> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Tracking requires the business transaction');
    return manager.save(
      WaybillStatusLog,
      manager.create(WaybillStatusLog, data),
    );
  }

  async findByVin(
    vin: string,
    scope: EffectiveScope,
  ): Promise<WaybillStatusLog[]> {
    const logs = await this.statusQuery(scope)
      .andWhere('l.vin = :vin', { vin })
      .getMany();
    if (logs.length === 0) {
      throw new NotFoundException('未找到该VIN的轨迹记录');
    }
    return logs;
  }

  // VIN 全生命周期：operation_logs + waybill_status_logs 归一化按 occurredAt 排序
  async timelineByVin(
    vin: string,
    scope: EffectiveScope,
  ): Promise<TimelineEntry[]> {
    const [opLogs, scanLogs] = await Promise.all([
      this.operationQuery(scope).andWhere('l.vin = :vin', { vin }).getMany(),
      this.statusQuery(scope).andWhere('l.vin = :vin', { vin }).getMany(),
    ]);
    return this.mergeSorted(opLogs, scanLogs);
  }

  async timelineByOrderId(
    orderId: string,
    scope: EffectiveScope,
  ): Promise<TimelineEntry[]> {
    const opLogs = await this.operationQuery(scope)
      .andWhere('l.orderId = :orderId', { orderId })
      .getMany();
    // waybill_status_logs 没直接挂 orderId；如果需要按订单聚合运单事件，取其 VIN 列表再回查
    const vins = Array.from(
      new Set(opLogs.map((l) => l.vin).filter((v): v is string => !!v)),
    );
    const scanLogs = vins.length
      ? await this.statusQuery(scope)
          .andWhere('l.vin IN (:...vins)', { vins })
          .getMany()
      : [];
    return this.mergeSorted(opLogs, scanLogs);
  }

  private operationQuery(scope: EffectiveScope) {
    const qb = this.opLogsRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.operator', 'operator')
      .leftJoinAndSelect('l.yard', 'yard')
      .leftJoinAndSelect('l.slot', 'slot')
      .leftJoinAndSelect('slot.zone', 'zone')
      .leftJoin(Waybill, 'w', 'w.id = l.waybillId')
      .leftJoin(Order, 'o', 'o.id = COALESCE(l.orderId, w.orderId)')
      .orderBy('l.eventAt', 'ASC');
    this.filterLogs(qb, scope);
    return qb;
  }

  private statusQuery(scope: EffectiveScope) {
    const qb = this.logsRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.operator', 'operator')
      .leftJoinAndSelect('l.yard', 'yard')
      .innerJoin('l.waybill', 'w')
      .leftJoin('w.order', 'o')
      .orderBy('l.createdAt', 'ASC');
    this.filterLogs(qb, scope);
    return qb;
  }

  private filterLogs<T extends object>(
    qb: SelectQueryBuilder<T>,
    scope: EffectiveScope,
  ) {
    if (scope.type === 'ORG') {
      qb.andWhere(
        'COALESCE(w.organizationId, o.organizationId, yard.organizationId) IN (:...orgs)',
        { orgs: scope.orgIds },
      );
      if (scope.role === Role.YARD_STAFF)
        qb.andWhere(
          '(yard.id = :yardId OR w.originYardId = :yardId OR w.destinationYardId = :yardId OR o.destinationYardId = :yardId)',
          { yardId: scope.scopeYardId },
        );
    } else if (scope.type === 'CARRIER') {
      qb.andWhere(
        '(w.carrierId = :carrierId OR o.pickupCarrierId = :carrierId)',
        { carrierId: scope.carrierId },
      );
    } else
      qb.andWhere('o.customerId = :customerId', {
        customerId: scope.customerId,
      });
  }

  private mergeSorted(
    opLogs: OperationLog[],
    scanLogs: WaybillStatusLog[],
  ): TimelineEntry[] {
    const merged: TimelineEntry[] = [
      ...opLogs.map<TimelineEntry>((o) => ({
        source: 'operation',
        occurredAt: o.eventAt ?? o.createdAt,
        createdAt: o.createdAt,
        type: o.operationType,
        vin: o.vin,
        orderId: o.orderId,
        waybillId:
          o.waybillId ??
          (o.payload as { waybillId?: string } | null)?.waybillId ??
          null,
        yard: o.yard
          ? { id: o.yard.id, name: o.yard.name, code: o.yard.code }
          : null,
        slot: o.slot
          ? {
              id: o.slot.id,
              line: o.slot.line,
              row: o.slot.row,
              zone: {
                id: o.slot.zone.id,
                code: o.slot.zone.code,
              },
            }
          : null,
        operator: o.operator
          ? { id: o.operator.id, displayName: o.operator.displayName }
          : null,
        // 旧数据兜底：老日志把照片放 payload.photoKeys；新代码统一在顶层 attachment_urls
        attachmentUrls:
          o.attachmentUrls ??
          (o.payload as { photoKeys?: string[] } | null)?.photoKeys ??
          null,
        payload: o.payload,
        remark: (o.payload as { remark?: string } | null)?.remark ?? null,
      })),
      ...scanLogs.map<TimelineEntry>((s) => ({
        source: 'waybill_scan',
        occurredAt: s.createdAt,
        createdAt: s.createdAt,
        type: s.action,
        vin: s.vin,
        orderId: null,
        waybillId: s.waybillId,
        yard: s.yard
          ? { id: s.yard.id, name: s.yard.name, code: s.yard.code }
          : null,
        slot: null,
        operator: s.operator
          ? { id: s.operator.id, displayName: s.operator.displayName }
          : null,
        attachmentUrls: s.attachmentUrls,
        payload: s.vehicleCheckInfo as Record<string, unknown> | null,
        remark: s.remark ?? null,
      })),
    ];
    merged.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return merged;
  }
}
