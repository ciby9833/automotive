import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceRecord } from './entities/finance-record.entity';
import { Waybill } from '../waybills/entities/waybill.entity';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { CustomersModule } from '../customers/customers.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinanceRecord, Waybill]),
    CustomersModule,
    EmailModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
