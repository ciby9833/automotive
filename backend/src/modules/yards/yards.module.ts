import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Yard } from './entities/yard.entity';
import { YardSlot } from './entities/yard-slot.entity';
import { YardsService } from './yards.service';
import { YardsController } from './yards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Yard, YardSlot])],
  controllers: [YardsController],
  providers: [YardsService],
  exports: [YardsService],
})
export class YardsModule {}
