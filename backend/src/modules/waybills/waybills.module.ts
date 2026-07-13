import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Waybill } from './entities/waybill.entity';
import { WaybillVin } from './entities/waybill-vin.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { YardSlot } from '../yards/entities/yard-slot.entity';
import { WaybillsService } from './waybills.service';
import { WaybillsController } from './waybills.controller';
import { TrackingModule } from '../tracking/tracking.module';
import { QueueModule } from '../queue/queue.module';
import { EmailModule } from '../email/email.module';

// OrderVin + YardSlot 也在 forFeature 里：启运扫码在事务内释放库位并解绑 OrderVin.slotId
// (车物理离开了始发仓，slot 变 VACANT 才能被下一台车用；WaybillsService 通过 mgr.getRepository 拿)
@Module({
  imports: [
    TypeOrmModule.forFeature([Waybill, WaybillVin, OrderVin, YardSlot]),
    TrackingModule,
    QueueModule,
    EmailModule,
  ],
  controllers: [WaybillsController],
  providers: [WaybillsService],
  exports: [WaybillsService],
})
export class WaybillsModule {}
