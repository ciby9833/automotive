import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceRecord } from './entities/finance-record.entity';
import { CreateFinanceRecordDto } from './dto/create-finance-record.dto';
import {
  FinanceRecordType,
  FinanceStatus,
} from '../../common/enums/waybill-status.enum';
import { CURRENCY_DECIMALS } from '../../common/enums/currency.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Waybill } from '../waybills/entities/waybill.entity';
import { CustomersService } from '../customers/customers.service';
import { EmailService } from '../email/email.service';

function formatAmount(amount: string, currency: string): string {
  const decimals =
    CURRENCY_DECIMALS[currency as keyof typeof CURRENCY_DECIMALS] ?? 2;
  const value = Number(amount);
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)} ${currency}`;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceRecord)
    private readonly recordsRepository: Repository<FinanceRecord>,
    @InjectRepository(Waybill)
    private readonly waybillsRepository: Repository<Waybill>,
    private readonly customersService: CustomersService,
    private readonly emailService: EmailService,
    private readonly scopeService: ScopeService,
  ) {}

  // FinanceRecord 现在直接带 organizationId + carrierId + customerId 三个维度，无需 join waybill 就能过滤
  findAll(
    scope: EffectiveScope,
    filters: {
      customerId?: string;
      carrierId?: string;
      organizationId?: string;
    },
  ): Promise<FinanceRecord[]> {
    const qb = this.recordsRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.waybill', 'waybill')
      .leftJoinAndSelect('waybill.organization', 'organization')
      .orderBy('record.createdAt', 'DESC');
    this.scopeService.applyScopeToQuery(qb, 'record', scope, {
      carrierIdCol: 'carrierId',
      customerIdCol: 'customerId',
      narrowToOrgId: filters.organizationId,
    });
    if (filters.customerId) {
      qb.andWhere('record.customerId = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.carrierId) {
      qb.andWhere('record.carrierId = :carrierId', {
        carrierId: filters.carrierId,
      });
    }
    return qb.getMany();
  }

  async create(
    dto: CreateFinanceRecordDto,
    scope: EffectiveScope,
  ): Promise<FinanceRecord> {
    const waybill = await this.waybillsRepository.findOne({
      where: { id: dto.waybillId },
    });
    if (!waybill) throw new NotFoundException('运单不存在');
    this.scopeService.assertOrgWritable(scope, waybill.organizationId);
    // FinanceRecord 的 organizationId 冗余存 waybill 的 organizationId，保持一致
    return this.recordsRepository.save(
      this.recordsRepository.create({
        ...dto,
        organizationId: waybill.organizationId,
      }),
    );
  }

  async confirm(id: string, scope: EffectiveScope): Promise<FinanceRecord> {
    const qb = this.recordsRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.waybill', 'waybill')
      .where('record.id = :id', { id });
    this.scopeService.applyScopeToQuery(qb, 'record', scope, {
      carrierIdCol: 'carrierId',
      customerIdCol: 'customerId',
    });
    const record = await qb.getOne();
    if (!record) throw new NotFoundException('对账记录不存在');
    record.status = FinanceStatus.CONFIRMED;
    return this.recordsRepository.save(record);
  }

  async notifyCustomer(
    customerId: string,
    scope: EffectiveScope,
  ): Promise<void> {
    const customer = await this.customersService.findOne(customerId, scope);
    if (!customer.email) {
      throw new BadRequestException('该客户未维护邮箱，无法发送账单');
    }

    const qb = this.recordsRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.waybill', 'waybill')
      .where('record.customerId = :customerId', { customerId })
      .andWhere('record.type = :type', { type: FinanceRecordType.REVENUE })
      .andWhere('record.status = :status', { status: FinanceStatus.PENDING });
    const records = await qb.getMany();
    if (records.length === 0) {
      throw new BadRequestException('该客户当前没有待确认的账单');
    }

    const currency = records[0].currency;
    const total = records.reduce((sum, r) => sum + Number(r.amount), 0);
    await this.emailService.sendCustomerBillEmail(customer.email, {
      customerName: customer.name,
      totalAmountFormatted: formatAmount(String(total), currency),
      lines: records.map((r) => ({
        waybillCode: r.waybill.waybillCode,
        amountFormatted: formatAmount(r.amount, r.currency),
      })),
    });
  }
}
