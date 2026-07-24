import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Carrier } from './entities/carrier.entity';
import { Driver } from './entities/driver.entity';
import { Vehicle } from './entities/vehicle.entity';
import { User } from '../users/entities/user.entity';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreateCarrierUserDto } from './dto/create-carrier-user.dto';
import { UpdateCarrierUserDto } from './dto/update-carrier-user.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '../../common/enums/role.enum';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';

@Injectable()
export class CarriersService {
  constructor(
    @InjectRepository(Carrier)
    private readonly carriersRepository: Repository<Carrier>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehiclesRepository: Repository<Vehicle>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
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

  // ============ 承运商账号管理 ============
  // 三级权限：HQ 全通、ORG 只能操作下属机构承运商、CARRIER_STAFF 只能自家
  // 归属校验落到 findOne 已经能挡跨承运商，但 CARRIER_STAFF 场景 findOne 会通过
  // (它 scope=CARRIER 且 carrier.id = scope.carrierId 匹配)；额外只需保证 role !== CARRIER_DRIVER
  private assertCarrierUserManagable(scope: EffectiveScope): void {
    if (scope.type === 'CARRIER' && scope.role === Role.CARRIER_DRIVER) {
      throw new ForbiddenException('司机账号无权管理承运商账号');
    }
    if (scope.type === 'CUSTOMER') {
      throw new ForbiddenException('客户账号无权管理承运商账号');
    }
  }

  async listCarrierUsers(
    carrierId: string,
    scope: EffectiveScope,
    filters?: {
      keyword?: string;
      role?: Role;
      active?: boolean;
    },
  ): Promise<
    Array<{
      id: string;
      username: string;
      displayName: string;
      role: Role;
      email: string | null;
      isActive: boolean;
      createdAt: Date;
    }>
  > {
    this.assertCarrierUserManagable(scope);
    await this.findOne(carrierId, scope);
    const qb = this.usersRepository
      .createQueryBuilder('u')
      .where('u.carrier_id = :cid', { cid: carrierId });

    // 只显示承运商相关的两类账号；CUSTOMER/内部账号不该出现在承运商用户列表里
    qb.andWhere('u.role IN (:...roles)', {
      roles: [Role.CARRIER_STAFF, Role.CARRIER_DRIVER],
    });

    if (filters?.role) {
      qb.andWhere('u.role = :r', { r: filters.role });
    }
    if (filters?.active !== undefined) {
      qb.andWhere('u.isActive = :a', { a: filters.active });
    }
    if (filters?.keyword) {
      const kw = `%${filters.keyword.trim()}%`;
      qb.andWhere(
        '(u.username ILIKE :kw OR u.displayName ILIKE :kw OR u.email ILIKE :kw)',
        { kw },
      );
    }
    const rows = await qb.orderBy('u.createdAt', 'DESC').getMany();
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
  }

  async createCarrierUser(
    carrierId: string,
    dto: CreateCarrierUserDto,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<User> {
    this.assertCarrierUserManagable(scope);
    const carrier = await this.findOne(carrierId, scope);

    if (dto.role !== Role.CARRIER_STAFF && dto.role !== Role.CARRIER_DRIVER) {
      throw new BadRequestException(
        '承运商账号只能是 CARRIER_STAFF 或 CARRIER_DRIVER',
      );
    }

    const existing = await this.usersRepository.findOne({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException('用户名已存在');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      username: dto.username,
      passwordHash,
      displayName: dto.displayName,
      role: dto.role,
      email: dto.email ?? null,
      carrierId,
    });
    const saved = await this.usersRepository.save(user);

    await this.audit.log({
      operationType: OperationType.CARRIER_USER_CREATE,
      operatorUserId,
      payload: {
        carrierId,
        carrierName: carrier.name,
        userId: saved.id,
        username: saved.username,
        role: saved.role,
      },
    });
    return saved;
  }

  async updateCarrierUser(
    carrierId: string,
    userId: string,
    dto: UpdateCarrierUserDto,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<User> {
    this.assertCarrierUserManagable(scope);
    const user = await this.getCarrierUserOrThrow(carrierId, userId, scope);

    const before = { displayName: user.displayName, email: user.email };
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.email !== undefined) user.email = dto.email ?? null;
    const saved = await this.usersRepository.save(user);

    await this.audit.log({
      operationType: OperationType.CARRIER_USER_UPDATE,
      operatorUserId,
      payload: {
        carrierId,
        userId,
        before,
        after: { displayName: saved.displayName, email: saved.email },
      },
    });
    return saved;
  }

  async deactivateCarrierUser(
    carrierId: string,
    userId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<User> {
    this.assertCarrierUserManagable(scope);
    const user = await this.getCarrierUserOrThrow(carrierId, userId, scope);
    if (user.id === operatorUserId) {
      throw new BadRequestException('不能禁用自己的账号');
    }
    if (!user.isActive) return user;
    user.isActive = false;
    const saved = await this.usersRepository.save(user);
    await this.audit.log({
      operationType: OperationType.CARRIER_USER_DEACTIVATE,
      operatorUserId,
      payload: { carrierId, userId, username: user.username },
    });
    return saved;
  }

  async reactivateCarrierUser(
    carrierId: string,
    userId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<User> {
    this.assertCarrierUserManagable(scope);
    const user = await this.getCarrierUserOrThrow(carrierId, userId, scope);
    if (user.isActive) return user;
    user.isActive = true;
    const saved = await this.usersRepository.save(user);
    await this.audit.log({
      operationType: OperationType.CARRIER_USER_REACTIVATE,
      operatorUserId,
      payload: { carrierId, userId, username: user.username },
    });
    return saved;
  }

  // 管理员直接改密：生成 12 位强随机密码；返回一次性明文让 UI 复制转交
  // 不发邮件、不写入其他地方；关闭弹窗即消失。业务风险由管理员承担
  async resetCarrierUserPassword(
    carrierId: string,
    userId: string,
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<{ username: string; temporaryPassword: string }> {
    this.assertCarrierUserManagable(scope);
    const user = await this.getCarrierUserOrThrow(carrierId, userId, scope);
    const temporaryPassword = generateReadablePassword();
    user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
    // 清除任何遗留的邮件重置 token，防旧链接被继续使用
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await this.usersRepository.save(user);
    await this.audit.log({
      operationType: OperationType.CARRIER_USER_RESET_PWD,
      operatorUserId,
      payload: { carrierId, userId, username: user.username },
    });
    return { username: user.username, temporaryPassword };
  }

  private async getCarrierUserOrThrow(
    carrierId: string,
    userId: string,
    scope: EffectiveScope,
  ): Promise<User> {
    // 先校验对该 carrier 的可见性
    await this.findOne(carrierId, scope);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.carrierId !== carrierId) {
      throw new NotFoundException('用户不属于此承运商');
    }
    return user;
  }
}

// 生成 12 位可读性强的随机密码（避免 0/O、1/l 等易混淆字符）
function generateReadablePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
