import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaybillStatusLog } from './entities/waybill-status-log.entity';
import { OperationLog } from './entities/operation-log.entity';
import { OperationType } from '../../common/enums/operation-type.enum';
import { ScanAction } from '../../common/enums/waybill-status.enum';

// 时间线统一节点：合并 OperationLog + WaybillStatusLog 两张表
// 前端渲染只关心 kind + operationOrAction + operator + createdAt + payload
export interface TimelineEntry {
  source: 'operation' | 'waybill_scan';
  createdAt: Date;
  type: OperationType | ScanAction;
  vin: string | null;
  orderId: string | null;
  waybillId: string | null;
  yardId: string | null;
  operator: { id: string; displayName: string } | null;
  attachmentUrls?: string[] | null;
  payload: Record<string, unknown> | null;
  remark?: string | null;
}

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(WaybillStatusLog)
    private readonly logsRepository: Repository<WaybillStatusLog>,
    @InjectRepository(OperationLog)
    private readonly opLogsRepository: Repository<OperationLog>,
  ) {}

  async appendLog(data: Partial<WaybillStatusLog>): Promise<WaybillStatusLog> {
    const log = this.logsRepository.create(data);
    return this.logsRepository.save(log);
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

  // 全生命周期时间线：按 vin / order 聚合两张审计表并按时间排序
  // 支持三种查询入口：VIN 车架号、订单号(orderCode)、订单 id
  async timelineByVin(vin: string): Promise<TimelineEntry[]> {
    const [opLogs, scanLogs] = await Promise.all([
      this.opLogsRepository.find({
        where: { vin },
        relations: ['operator'],
        order: { createdAt: 'ASC' },
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
      relations: ['operator'],
      order: { createdAt: 'ASC' },
    });
    // waybill_status_logs 没直接挂 orderId；如果需要按订单聚合运单事件，取其 VIN 列表再回查
    const vins = Array.from(new Set(opLogs.map((l) => l.vin).filter((v): v is string => !!v)));
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
        createdAt: o.createdAt,
        type: o.operationType,
        vin: o.vin,
        orderId: o.orderId,
        waybillId: (o.payload as { waybillId?: string } | null)?.waybillId ?? null,
        yardId: null,
        operator: o.operator
          ? { id: o.operator.id, displayName: o.operator.displayName }
          : null,
        payload: o.payload,
      })),
      ...scanLogs.map<TimelineEntry>((s) => ({
        source: 'waybill_scan',
        createdAt: s.createdAt,
        type: s.action,
        vin: s.vin,
        orderId: null,
        waybillId: s.waybillId,
        yardId: s.yardId,
        operator: s.operator
          ? { id: s.operator.id, displayName: s.operator.displayName }
          : null,
        attachmentUrls: s.attachmentUrls,
        payload: s.vehicleCheckInfo as Record<string, unknown> | null,
        remark: s.remark,
      })),
    ];
    merged.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return merged;
  }
}
