import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Carrier } from './entities/carrier.entity';
import { Driver } from './entities/driver.entity';
import { Vehicle } from './entities/vehicle.entity';
import { CarriersService } from './carriers.service';
import { CarriersController } from './carriers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Carrier, Driver, Vehicle])],
  controllers: [CarriersController],
  providers: [CarriersService],
  exports: [CarriersService],
})
export class CarriersModule {}
