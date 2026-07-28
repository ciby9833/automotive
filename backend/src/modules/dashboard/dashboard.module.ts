import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DailySnapshotService } from './daily-snapshot.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DailySnapshotService],
})
export class DashboardModule {}
