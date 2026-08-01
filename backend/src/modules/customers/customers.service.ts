import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CreateCustomerAddressDto,
  ImportCustomerAddressesDto,
} from './dto/create-customer-address.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { PartnerStatus } from '../../common/enums/partner-status.enum';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(CustomerAddress)
    private readonly addressesRepository: Repository<CustomerAddress>,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ============ 客户主数据编辑 / 状态化启停 ============
  async update(
    customerId: string,
    dto: UpdateCustomerDto,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<Customer> {
    const customer = await this.findOne(customerId, scope);
    if (scope.type === 'CUSTOMER') {
      throw new ForbiddenException('客户账号无权编辑主数据');
    }
    const before = {
      name: customer.name,
      contactName: customer.contactName,
      contactPhone: customer.contactPhone,
      email: customer.email,
    };
    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.contactName !== undefined) customer.contactName = (dto.contactName ?? null) as string;
    if (dto.contactPhone !== undefined) customer.contactPhone = (dto.contactPhone ?? null) as string;
    if (dto.email !== undefined) customer.email = (dto.email ?? null) as string;
    if (dto.quotationNote !== undefined) customer.quotationNote = (dto.quotationNote ?? null) as string;
    const saved = await this.customersRepository.save(customer);
    await this.audit.log({
      operationType: OperationType.CUSTOMER_UPDATE,
      operatorUserId,
      payload: { customerId, before, patch: dto },
    });
    return saved;
  }

  private async countInflight(customerId: string): Promise<number> {
    const rows: Array<{ count: string }> = await this.ordersRepository.query(
      `
      SELECT COUNT(*)::text AS count
      FROM orders o
      WHERE o.customer_id = $1
        AND o.status = 'ACTIVE'
        AND (
          (
            o."transportType" IN ('TRANSFER', 'REALLOCATION')
            AND EXISTS (
              SELECT 1 FROM order_vins ov
              WHERE ov.order_id = o.id AND ov.arrival_status = 'EXPECTED'
            )
          )
          OR
          (
            o."transportType" = 'DELIVERY'
            AND (
              EXISTS (
                SELECT 1 FROM order_vins ov
                WHERE ov.outbound_order_id = o.id
                  AND ov.arrival_status <> 'CANCELLED'
                  AND ov."isAllocated" = false
              )
              OR EXISTS (
                SELECT 1 FROM waybills w
                WHERE w.order_id = o.id
                  AND w.status IN ('NOT_ARRIVED', 'IN_TRANSIT')
              )
            )
          )
        )
      `,
      [customerId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async setStatus(
    customerId: string,
    status: PartnerStatus,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<{ customer: Customer; inflightCount: number }> {
    const customer = await this.findOne(customerId, scope);
    if (scope.type === 'CUSTOMER') {
      throw new ForbiddenException('客户账号无权改自身启停状态');
    }
    if (customer.status === status) {
      return { customer, inflightCount: 0 };
    }
    const inflightCount = await this.countInflight(customerId);
    if (status === PartnerStatus.INACTIVE && inflightCount > 0) {
      throw new BadRequestException({
        code: 'PARTNER_HAS_INFLIGHT_BUSINESS',
        message: `${customer.name} 有 ${inflightCount} 张未完成订单，请先暂停新增业务，待订单完成后再停用`,
        inflightCount,
        allowedAction: PartnerStatus.PAUSED,
      });
    }
    const previousStatus = customer.status;
    customer.status = status;
    const saved = await this.customersRepository.save(customer);
    await this.audit.log({
      operationType: OperationType.CUSTOMER_STATUS_CHANGE,
      operatorUserId,
      payload: {
        customerId,
        name: customer.name,
        inflightCount,
        previousStatus,
        status,
      },
    });
    return { customer: saved, inflightCount };
  }

  findAll(scope: EffectiveScope, narrowToOrgId?: string): Promise<Customer[]> {
    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.organization', 'organization')
      .orderBy('organization.name', 'ASC')
      .addOrderBy('customer.name', 'ASC');
    this.scopeService.applyScopeToQuery(qb, 'customer', scope, {
      customerIdCol: 'id',
      narrowToOrgId,
    });
    return qb.getMany();
  }

  async findOne(id: string, scope: EffectiveScope): Promise<Customer> {
    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.addresses', 'addresses')
      .where('customer.id = :id', { id });
    this.scopeService.applyScopeToQuery(qb, 'customer', scope, {
      customerIdCol: 'id',
    });
    const customer = await qb.getOne();
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  create(dto: CreateCustomerDto, scope: EffectiveScope): Promise<Customer> {
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    return this.customersRepository.save(this.customersRepository.create(dto));
  }

  async addAddress(
    customerId: string,
    dto: CreateCustomerAddressDto,
    scope: EffectiveScope,
  ): Promise<CustomerAddress> {
    await this.findOne(customerId, scope);
    const address = this.addressesRepository.create({ ...dto, customerId });
    return this.addressesRepository.save(address);
  }

  async updateAddress(
    addressId: string,
    dto: Partial<CreateCustomerAddressDto>,
    scope: EffectiveScope,
  ): Promise<CustomerAddress> {
    const address = await this.addressesRepository.findOne({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundException('地址不存在');
    await this.findOne(address.customerId, scope);
    Object.assign(address, dto);
    return this.addressesRepository.save(address);
  }

  async deleteAddress(addressId: string, scope: EffectiveScope): Promise<void> {
    const address = await this.addressesRepository.findOne({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundException('地址不存在');
    await this.findOne(address.customerId, scope);
    await this.addressesRepository.delete(addressId);
  }

  // 批量导入 (BYD 门店 Excel)：按 code 去重，已存在的更新其他字段
  async importAddresses(
    customerId: string,
    dto: ImportCustomerAddressesDto,
    scope: EffectiveScope,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    await this.findOne(customerId, scope);

    // 入参内自我去重（相同 code）
    const seen = new Set<string>();
    const rows = dto.addresses.filter((a) => {
      if (!a.code) return true;
      const key = a.code.trim().toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (rows.length === 0) {
      throw new BadRequestException('导入的地址列表为空');
    }

    // 查已存在的 code
    const codes = rows.map((r) => r.code).filter((c): c is string => !!c);
    const existing =
      codes.length > 0
        ? await this.addressesRepository
            .createQueryBuilder('a')
            .where('a.customer_id = :cid', { cid: customerId })
            .andWhere('a.code IN (:...codes)', { codes })
            .getMany()
        : [];
    const existingByCode = new Map(existing.map((e) => [e.code, e]));

    let created = 0;
    let updated = 0;
    const toSave: CustomerAddress[] = [];
    for (const row of rows) {
      if (row.code && existingByCode.has(row.code)) {
        const cur = existingByCode.get(row.code)!;
        Object.assign(cur, row);
        toSave.push(cur);
        updated += 1;
      } else {
        toSave.push(
          this.addressesRepository.create({ ...row, customerId }),
        );
        created += 1;
      }
    }
    await this.addressesRepository.save(toSave);
    return {
      created,
      updated,
      skipped: dto.addresses.length - rows.length,
    };
  }

  findByIdUnscoped(id: string): Promise<Customer | null> {
    return this.customersRepository.findOne({ where: { id } });
  }
}
