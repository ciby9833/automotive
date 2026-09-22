import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YardInventory } from './entities/yard-inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryService } from './inventory.service';
import { TrackingModule } from '../tracking/tracking.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([YardInventory, InventoryMovement]),
    TrackingModule,
  ],
  providers: [InventoryService],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
