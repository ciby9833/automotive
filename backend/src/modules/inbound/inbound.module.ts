import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { InboundBatch } from './entities/inbound-batch.entity';
import { Yard } from '../yards/entities/yard.entity';
import { YardSlot } from '../yards/entities/yard-slot.entity';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderVin, InboundBatch, Yard, YardSlot]),
    TrackingModule,
  ],
  controllers: [InboundController],
  providers: [InboundService],
  exports: [InboundService],
})
export class InboundModule {}
