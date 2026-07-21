import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { Yard } from '../yards/entities/yard.entity';
import { YardSlot } from '../yards/entities/yard-slot.entity';
import { Waybill } from '../waybills/entities/waybill.entity';
import { WaybillVin } from '../waybills/entities/waybill-vin.entity';
import { Carrier } from '../carriers/entities/carrier.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { OutboundService } from './outbound.service';
import { OutboundController } from './outbound.controller';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderVin,
      Yard,
      YardSlot,
      Waybill,
      WaybillVin,
      Carrier,
      CustomerAddress,
    ]),
    TrackingModule,
  ],
  controllers: [OutboundController],
  providers: [OutboundService],
  exports: [OutboundService],
})
export class OutboundModule {}
