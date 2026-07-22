import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Carrier } from './entities/carrier.entity';
import { Driver } from './entities/driver.entity';
import { Vehicle } from './entities/vehicle.entity';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class CarriersService {
  constructor(
    @InjectRepository(Carrier)
    private readonly carriersRepository: Repository<Carrier>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehiclesRepository: Repository<Vehicle>,
    private readonly scopeService: ScopeService,
  ) {}

  findAll(scope: EffectiveScope, narrowToOrgId?: string): Promise<Carrier[]> {
    const qb = this.carriersRepository
      .createQueryBuilder('carrier')
      .leftJoinAndSelect('carrier.organization', 'organization')
      .orderBy('organization.name', 'ASC')
      .addOrderBy('carrier.name', 'ASC');
    // CARRIER 账号只能看自己(id 就是 carrierId)
    this.scopeService.applyScopeToQuery(qb, 'carrier', scope, {
      carrierIdCol: 'id',
      narrowToOrgId,
    });
    return qb.getMany();
  }

  async findOne(id: string, scope: EffectiveScope): Promise<Carrier> {
    const qb = this.carriersRepository
      .createQueryBuilder('carrier')
      .leftJoinAndSelect('carrier.drivers', 'drivers')
      .leftJoinAndSelect('carrier.vehicles', 'vehicles')
      .where('carrier.id = :id', { id });
    this.scopeService.applyScopeToQuery(qb, 'carrier', scope, {
      carrierIdCol: 'id',
    });
    const carrier = await qb.getOne();
    if (!carrier) throw new NotFoundException('供应商不存在');
    return carrier;
  }

  create(dto: CreateCarrierDto, scope: EffectiveScope): Promise<Carrier> {
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    return this.carriersRepository.save(this.carriersRepository.create(dto));
  }

  async addDriver(
    carrierId: string,
    dto: CreateDriverDto,
    scope: EffectiveScope,
  ): Promise<Driver> {
    await this.findOne(carrierId, scope);
    const driver = this.driversRepository.create({ ...dto, carrierId });
    return this.driversRepository.save(driver);
  }

  async addVehicle(
    carrierId: string,
    dto: CreateVehicleDto,
    scope: EffectiveScope,
  ): Promise<Vehicle> {
    await this.findOne(carrierId, scope);
    const vehicle = this.vehiclesRepository.create({ ...dto, carrierId });
    return this.vehiclesRepository.save(vehicle);
  }

  findByIdUnscoped(id: string): Promise<Carrier | null> {
    return this.carriersRepository.findOne({ where: { id } });
  }

  // 分派运单时使用：拉某承运商的司机 / 拖车列表
  async listDrivers(carrierId: string, scope: EffectiveScope): Promise<Driver[]> {
    await this.findOne(carrierId, scope);
    return this.driversRepository.find({
      where: { carrierId },
      order: { name: 'ASC' },
    });
  }

  async listVehicles(
    carrierId: string,
    scope: EffectiveScope,
  ): Promise<Vehicle[]> {
    await this.findOne(carrierId, scope);
    return this.vehiclesRepository.find({
      where: { carrierId },
      order: { plateNumber: 'ASC' },
    });
  }
}
