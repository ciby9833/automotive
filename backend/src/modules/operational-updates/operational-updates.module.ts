import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OperationalUpdatesService } from './operational-updates.service';
import { OperationalUpdatesGateway } from './operational-updates.gateway';
@Module({
  imports: [JwtModule.register({})],
  providers: [OperationalUpdatesService, OperationalUpdatesGateway],
  exports: [OperationalUpdatesService],
})
export class OperationalUpdatesModule {}
