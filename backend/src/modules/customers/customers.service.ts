import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import {
  CreateCustomerAddressDto,
  ImportCustomerAddressesDto,
} from './dto/create-customer-address.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(CustomerAddress)
    private readonly addressesRepository: Repository<CustomerAddress>,
    private readonly scopeService: ScopeService,
  ) {}

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
