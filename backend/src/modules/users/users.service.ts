import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { User } from './entities/user.entity';
import { UserOrganizationMembership } from './entities/user-organization-membership.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddMembershipDto } from './dto/add-membership.dto';
import { Role } from '../../common/enums/role.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// 机构管理员可管理同级 ORG_ADMIN(方便本机构团队互相备份) + 下级 YARD_STAFF；
// 但绝不允许创建 HQ_ADMIN，避免机构管理员提权到总部
const ORG_ADMIN_MANAGEABLE_ROLES = new Set([Role.ORG_ADMIN, Role.YARD_STAFF]);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserOrganizationMembership)
    private readonly membershipsRepository: Repository<UserOrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
  ) {}

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  // 列表：内部账号按 scope.orgIds 内的 memberships 筛选；外部账号不在此接口显示
  // （外部账号在对应 Carrier/Customer 详情页里管理）
  async findAll(scope: EffectiveScope): Promise<User[]> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权查看用户列表');
    }
    const rows = await this.membershipsRepository
      .createQueryBuilder('m')
      .select('DISTINCT m.userId', 'userId')
      .where('m.organizationId IN (:...ids)', { ids: scope.orgIds })
      .getRawMany<{ userId: string }>();
    const ids = rows.map((r) => r.userId);
    if (ids.length === 0) return [];
    return this.usersRepository.find({
      where: { id: In(ids) },
      relations: { memberships: { organization: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneScoped(userId: string, scope: EffectiveScope): Promise<User> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权查看');
    }
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { memberships: { organization: true } },
    });
    if (!user) throw new NotFoundException('用户不存在');
    const overlaps = user.memberships.some((m) =>
      scope.orgIds.includes(m.organizationId),
    );
    if (!overlaps) {
      throw new ForbiddenException('无权查看该用户');
    }
    return user;
  }

  async create(dto: CreateUserDto, scope: EffectiveScope): Promise<User> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权创建用户');
    }
    // 目标机构必须在 scope 内
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    // 机构管理员不能提权到 HQ_ADMIN
    if (
      scope.role === Role.ORG_ADMIN &&
      !ORG_ADMIN_MANAGEABLE_ROLES.has(dto.role)
    ) {
      throw new ForbiddenException(
        '机构管理员只能创建 ORG_ADMIN 或 YARD_STAFF 账号',
      );
    }
    if (dto.role === Role.YARD_STAFF && !dto.scopeYardId) {
      throw new BadRequestException('YARD_STAFF 必须指定 scopeYardId');
    }

    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('用户名已存在');

    return this.dataSource.transaction(async (mgr) => {
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = mgr.create(User, {
        username: dto.username,
        passwordHash,
        displayName: dto.displayName,
        role: dto.role,
        scopeYardId: dto.scopeYardId ?? null,
        email: dto.email ?? null,
      });
      const saved = await mgr.save(user);

      const membership = mgr.create(UserOrganizationMembership, {
        userId: saved.id,
        organizationId: dto.organizationId,
        role: dto.role,
      });
      await mgr.save(membership);

      return mgr.findOneOrFail(User, {
        where: { id: saved.id },
        relations: { memberships: { organization: true } },
      });
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    scope: EffectiveScope,
  ): Promise<User> {
    const user = await this.findOneScoped(id, scope);
    Object.assign(user, {
      displayName: dto.displayName ?? user.displayName,
      scopeYardId:
        dto.scopeYardId !== undefined ? dto.scopeYardId : user.scopeYardId,
      email: dto.email !== undefined ? dto.email : user.email,
      isActive: dto.isActive ?? user.isActive,
    });
    return this.usersRepository.save(user);
  }

  async deactivate(id: string, scope: EffectiveScope): Promise<User> {
    const user = await this.findOneScoped(id, scope);
    user.isActive = false;
    return this.usersRepository.save(user);
  }

  async reactivate(id: string, scope: EffectiveScope): Promise<User> {
    const user = await this.findOneScoped(id, scope);
    user.isActive = true;
    return this.usersRepository.save(user);
  }

  // 增加 membership：目标 org 必须在当前操作者 scope 内；
  // ORG_ADMIN 只允许添加 YARD_STAFF 角色
  async addMembership(
    userId: string,
    dto: AddMembershipDto,
    scope: EffectiveScope,
  ): Promise<UserOrganizationMembership> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权维护用户机构关系');
    }
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    if (
      scope.role === Role.ORG_ADMIN &&
      !ORG_ADMIN_MANAGEABLE_ROLES.has(dto.role)
    ) {
      throw new ForbiddenException(
        '机构管理员只能添加 ORG_ADMIN 或 YARD_STAFF 的 membership',
      );
    }
    // 用户必须在当前 scope 可见
    await this.findOneScoped(userId, scope);

    const existing = await this.membershipsRepository.findOne({
      where: { userId, organizationId: dto.organizationId },
    });
    if (existing) throw new ConflictException('此用户已在该机构有 membership');
    const membership = this.membershipsRepository.create({
      userId,
      organizationId: dto.organizationId,
      role: dto.role,
    });
    return this.membershipsRepository.save(membership);
  }

  async removeMembership(
    userId: string,
    membershipId: string,
    scope: EffectiveScope,
  ): Promise<void> {
    const membership = await this.membershipsRepository.findOne({
      where: { id: membershipId, userId },
    });
    if (!membership) throw new NotFoundException('membership 不存在');
    this.scopeService.assertOrgWritable(scope, membership.organizationId);
    await this.membershipsRepository.delete(membership.id);
  }

  async listMemberships(
    userId: string,
    scope: EffectiveScope,
  ): Promise<UserOrganizationMembership[]> {
    await this.findOneScoped(userId, scope);
    return this.membershipsRepository.find({
      where: { userId },
      relations: { organization: true },
    });
  }

  // 找回密码相关（不涉及 scope，公开身份可用）
  async createPasswordResetToken(
    email: string,
  ): Promise<{ user: User; token: string } | null> {
    const user = await this.findByEmail(email);
    if (!user || !user.isActive) return null;
    const token = randomBytes(32).toString('hex');
    user.passwordResetToken = hashToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.usersRepository.save(user);
    return { user, token };
  }

  async resetPasswordByToken(
    token: string,
    newPassword: string,
  ): Promise<void> {
    const hashed = hashToken(token);
    const user = await this.usersRepository.findOne({
      where: { passwordResetToken: hashed },
    });
    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException('重置链接无效或已过期');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await this.usersRepository.save(user);
  }
}
