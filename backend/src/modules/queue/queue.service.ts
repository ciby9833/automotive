import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NOTIFICATION_QUEUE, NotificationJob } from './queue.constants';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
  ) {}

  async notifyWaybillStatusChanged(payload: {
    waybillId: string;
    vin: string;
    status: string;
  }) {
    await this.notificationQueue.add(
      NotificationJob.WAYBILL_STATUS_CHANGED,
      payload,
    );
  }
}
