import { Module } from '@nestjs/common';
import { ScopeModule } from '../../common/scope/scope.module';
import { StorageModule } from '../storage/storage.module';
import { TransportController } from './transport.controller';
import { TransportAccess } from './transport.access';
import { TransportOrdersService } from './transport-orders.service';
import { TransportTripsService } from './transport-trips.service';
import { TransportFinanceService } from './transport-finance.service';

@Module({
  imports: [ScopeModule, StorageModule],
  controllers: [TransportController],
  providers: [
    TransportAccess,
    TransportOrdersService,
    TransportTripsService,
    TransportFinanceService,
  ],
})
export class TransportModule {}
