import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATION_QUEUE } from '../queue.constants';

// P0阶段先打印日志占位；后续接短信/站内信/AI异常解释等能力时只需扩展这里
@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  process(job: Job): Promise<void> {
    this.logger.log(`处理通知任务 ${job.name}: ${JSON.stringify(job.data)}`);
    return Promise.resolve();
  }
}
