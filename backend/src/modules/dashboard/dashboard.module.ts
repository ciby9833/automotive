import { OperationalUpdatesModule } from '../operational-updates/operational-updates.module';
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DailySnapshotService } from './daily-snapshot.service';

@Module({
  imports: [OperationalUpdatesModule],
  controllers: [DashboardController],
  providers: [DashboardService, DailySnapshotService],
})
export class DashboardModule {}
