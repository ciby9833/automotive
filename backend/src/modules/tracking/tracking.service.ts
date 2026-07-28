import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaybillStatusLog } from './entities/waybill-status-log.entity';
import { OperationLog } from './entities/operation-log.entity';
import { DriverPosition } from './entities/driver-position.entity';
import { DriverPositionBatchDto } from './dto/driver-position-batch.dto';
import { OperationType } from '../../common/enums/operation-type.enum';
import { ScanAction } from '../../common/enums/waybill-status.enum';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/auth.types';

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
  slot: { id: string; code: string } | null;
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

  // 事务外调用，失败不阻塞业务：DB 层面的问题（enum 缺值 / 权限 / 网络抖动）
  // 都不应该让"装车成功了但接口 500"的故事重演。返回 null 表明记录失败但业务已成。
  async appendLog(
    data: Partial<WaybillStatusLog>,
  ): Promise<WaybillStatusLog | null> {
    try {
      const log = this.logsRepository.create(data);
      return await this.logsRepository.save(log);
    } catch (err) {
      this.logger.error(
        `tracking appendLog failed action=${data.action} vin=${data.vin}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async findByVin(vin: string): Promise<WaybillStatusLog[]> {
    const logs = await this.logsRepository.find({
      where: { vin },
      order: { createdAt: 'ASC' },
      relations: ['yard', 'operator'],
    });
    if (logs.length === 0) {
      throw new NotFoundException('未找到该VIN的轨迹记录');
    }
    return logs;
  }

  // VIN 全生命周期：operation_logs + waybill_status_logs 归一化按 occurredAt 排序
  async timelineByVin(vin: string): Promise<TimelineEntry[]> {
    const [opLogs, scanLogs] = await Promise.all([
      this.opLogsRepository.find({
        where: { vin },
        relations: ['operator', 'yard', 'slot'],
        order: { eventAt: 'ASC' },
      }),
      this.logsRepository.find({
        where: { vin },
        relations: ['operator', 'yard'],
        order: { createdAt: 'ASC' },
      }),
    ]);
    return this.mergeSorted(opLogs, scanLogs);
  }

  async timelineByOrderId(orderId: string): Promise<TimelineEntry[]> {
    const opLogs = await this.opLogsRepository.find({
      where: { orderId },
      relations: ['operator', 'yard', 'slot'],
      order: { eventAt: 'ASC' },
    });
    // waybill_status_logs 没直接挂 orderId；如果需要按订单聚合运单事件，取其 VIN 列表再回查
    const vins = Array.from(
      new Set(opLogs.map((l) => l.vin).filter((v): v is string => !!v)),
    );
    const scanLogs = vins.length
      ? await this.logsRepository
          .createQueryBuilder('l')
          .leftJoinAndSelect('l.operator', 'operator')
          .leftJoinAndSelect('l.yard', 'yard')
          .where('l.vin IN (:...vins)', { vins })
          .orderBy('l.createdAt', 'ASC')
          .getMany()
      : [];
    return this.mergeSorted(opLogs, scanLogs);
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
        slot: o.slot ? { id: o.slot.id, code: o.slot.code } : null,
        operator: o.operator
          ? { id: o.operator.id, displayName: o.operator.displayName }
          : null,
        // 旧数据兜底：老日志把照片放 payload.photoKeys；新代码统一在顶层 attachment_urls
        attachmentUrls:
          o.attachmentUrls ??
          ((o.payload as { photoKeys?: string[] } | null)?.photoKeys ?? null),
        payload: o.payload,
        remark:
          (o.payload as { remark?: string } | null)?.remark ?? null,
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
