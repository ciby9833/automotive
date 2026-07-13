import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerAddress } from './entities/customer-address.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
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

  findByIdUnscoped(id: string): Promise<Customer | null> {
    return this.customersRepository.findOne({ where: { id } });
  }
}
