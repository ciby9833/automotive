import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLog } from './entities/operation-log.entity';
import { OperationType } from '../../common/enums/operation-type.enum';

// 通用业务操作审计。所有关键节点 (下单/取消/提货/入库/移位/开单等) 都调 log()
// 与 TrackingService.appendLog (专门给 waybill scan 事件用) 并列存在，前端时间线合并展示
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(OperationLog)
    private readonly logs: Repository<OperationLog>,
  ) {}

  // 幂等最外层保底：审计失败不能阻塞业务事务
  async log(data: {
    operationType: OperationType;
    orderId?: string | null;
    vin?: string | null;
    yardId?: string | null;
    slotId?: string | null;
    waybillId?: string | null;
    attachmentUrls?: string[] | null;
    payload?: Record<string, unknown> | null;
    operatorUserId?: string | null;
    // 业务发生时间：不传则用 now()（sysdate = createdAt = eventAt）
    eventAt?: Date | null;
  }): Promise<void> {
    try {
      const row = this.logs.create({
        operationType: data.operationType,
        orderId: data.orderId ?? null,
        vin: data.vin ?? null,
        yardId: data.yardId ?? null,
        slotId: data.slotId ?? null,
        waybillId: data.waybillId ?? null,
        attachmentUrls: data.attachmentUrls ?? null,
        payload: data.payload ?? null,
        operatorUserId: data.operatorUserId ?? null,
        eventAt: data.eventAt ?? new Date(),
      });
      await this.logs.save(row);
    } catch (err) {
      this.logger.error(
        `audit log failed for ${data.operationType}: ${(err as Error).message}`,
      );
    }
  }

  // 批量写：import 类订单动作时每 VIN 一条，直接 insert 全部避免 N 次 network
  async logMany(
    rows: Array<Parameters<AuditService['log']>[0]>,
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      const entities = rows.map((r) =>
        this.logs.create({
          operationType: r.operationType,
          orderId: r.orderId ?? null,
          vin: r.vin ?? null,
          yardId: r.yardId ?? null,
          slotId: r.slotId ?? null,
          waybillId: r.waybillId ?? null,
          attachmentUrls: r.attachmentUrls ?? null,
          payload: r.payload ?? null,
          operatorUserId: r.operatorUserId ?? null,
          eventAt: r.eventAt ?? new Date(),
        }),
      );
      await this.logs.save(entities);
    } catch (err) {
      this.logger.error(
        `audit logMany failed: ${(err as Error).message}`,
      );
    }
  }
}
