import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Carrier } from './entities/carrier.entity';
import { Driver } from './entities/driver.entity';
import { Vehicle } from './entities/vehicle.entity';
import { User } from '../users/entities/user.entity';
import { Waybill } from '../waybills/entities/waybill.entity';
import { CarriersService } from './carriers.service';
import { CarriersController } from './carriers.controller';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Carrier, Driver, Vehicle, User, Waybill]),
    TrackingModule,
  ],
  controllers: [CarriersController],
  providers: [CarriersService],
  exports: [CarriersService],
})
export class CarriersModule {}
