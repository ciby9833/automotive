import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaybillStatusLog } from './entities/waybill-status-log.entity';
import { OperationLog } from './entities/operation-log.entity';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { TrackingGateway } from './tracking.gateway';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([WaybillStatusLog, OperationLog])],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingGateway, AuditService],
  exports: [TrackingService, TrackingGateway, AuditService],
})
export class TrackingModule {}
