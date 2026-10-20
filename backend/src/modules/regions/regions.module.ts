import { Module } from '@nestjs/common';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { RegionsAdminService } from './regions-admin.service';

@Module({
  controllers: [RegionsController],
  providers: [RegionsService, RegionsAdminService],
  exports: [RegionsService],
})
export class RegionsModule {}
