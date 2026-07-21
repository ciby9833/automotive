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
    payload?: Record<string, unknown> | null;
    operatorUserId?: string | null;
  }): Promise<void> {
    try {
      const row = this.logs.create({
        operationType: data.operationType,
        orderId: data.orderId ?? null,
        vin: data.vin ?? null,
        payload: data.payload ?? null,
        operatorUserId: data.operatorUserId ?? null,
      });
      await this.logs.save(row);
    } catch (err) {
      this.logger.error(
        `audit log failed for ${data.operationType}: ${(err as Error).message}`,
      );
    }
  }
}
