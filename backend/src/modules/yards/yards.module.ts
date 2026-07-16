import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Yard } from './entities/yard.entity';
import { YardSlot } from './entities/yard-slot.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { WaybillVin } from '../waybills/entities/waybill-vin.entity';
import { WaybillStatusLog } from '../tracking/entities/waybill-status-log.entity';
import { YardsService } from './yards.service';
import { YardsController } from './yards.controller';

// VIN 生命周期查询要跨表：OrderVin (pickup+arrival) / WaybillVin (出库运单) / WaybillStatusLog (扫码事件)
// 都用 mgr.getRepository 走同实体，不额外注入 repo
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Yard,
      YardSlot,
      OrderVin,
      WaybillVin,
      WaybillStatusLog,
    ]),
  ],
  controllers: [YardsController],
  providers: [YardsService],
  exports: [YardsService],
})
export class YardsModule {}
