import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NOTIFICATION_QUEUE } from './queue.constants';
import { NotificationProcessor } from './processors/notification.processor';
import { QueueService } from './queue.service';

// 异步任务基础设施：运单状态变更通知、日报生成、异常提醒等都通过队列异步处理，
// 避免阻塞主流程接口响应。P0阶段先跑通一个通知队列作为范例
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [NotificationProcessor, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
