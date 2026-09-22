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
import {
  AddMembershipDto,
  UpdateMembershipDto,
} from './dto/add-membership.dto';
import { Role } from '../../common/enums/role.enum';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { AccessRolesService } from './access-roles.service';
import { Organization } from '../organizations/entities/organization.entity';
import { Yard } from '../yards/entities/yard.entity';

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
    private readonly accessRoles: AccessRolesService,
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

  async assignmentYards(organizationId: string, scope: EffectiveScope) {
    this.scopeService.assertOrgReadable(scope, organizationId);
    return this.dataSource.getRepository(Yard).find({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
      order: { code: 'ASC' },
    });
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
    const users = await this.usersRepository.find({
      where: { id: In(ids) },
      relations: { memberships: { organization: true, accessRoles: true } },
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => {
      u.memberships = u.memberships.filter((m) =>
        scope.orgIds.includes(m.organizationId),
      );
      return u;
    });
  }

  async findOneScoped(userId: string, scope: EffectiveScope): Promise<User> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权查看');
    }
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { memberships: { organization: true, accessRoles: true } },
    });
    if (!user) throw new NotFoundException('用户不存在');
    const overlaps = user.memberships.some((m) =>
      scope.orgIds.includes(m.organizationId),
    );
    if (!overlaps) {
      throw new ForbiddenException('无权查看该用户');
    }
    user.memberships = user.memberships.filter((m) =>
      scope.orgIds.includes(m.organizationId),
    );
    return user;
  }

  async create(dto: CreateUserDto, scope: EffectiveScope): Promise<User> {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权创建用户');
    }
    // 目标机构必须在 scope 内
    const grant = await this.validateGrant(dto, scope);
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
        email: dto.email ?? null,
      });
      const saved = await mgr.save(user);

      const membership = mgr.create(UserOrganizationMembership, {
        userId: saved.id,
        organizationId: dto.organizationId,
        role: dto.role,
        ...grant,
        accessRoles: await this.accessRoles.forAssignment(
          dto.roleIds ?? [],
          dto.organizationId,
          dto.role,
          scope,
          mgr,
        ),
      });
      await mgr.save(membership);

      return mgr.findOneOrFail(User, {
        where: { id: saved.id },
        relations: { memberships: { organization: true, accessRoles: true } },
      });
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    scope: EffectiveScope,
  ): Promise<User> {
    await this.assertAccountManageable(id, scope);
    const user = await this.findOneScoped(id, scope);
    Object.assign(user, {
      displayName: dto.displayName ?? user.displayName,
      email: dto.email !== undefined ? dto.email : user.email,
      isActive: dto.isActive ?? user.isActive,
    });
    return this.usersRepository.save(user);
  }

  async deactivate(id: string, scope: EffectiveScope): Promise<User> {
    await this.assertAccountManageable(id, scope);
    const user = await this.findOneScoped(id, scope);
    user.isActive = false;
    return this.usersRepository.save(user);
  }

  async reactivate(id: string, scope: EffectiveScope): Promise<User> {
    await this.assertAccountManageable(id, scope);
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
    const grant = await this.validateGrant(dto, scope);
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
    return this.dataSource.transaction(async (mgr) => {
      const membership = mgr.create(UserOrganizationMembership, {
        userId,
        organizationId: dto.organizationId,
        role: dto.role,
        ...grant,
        accessRoles: await this.accessRoles.forAssignment(
          dto.roleIds ?? [],
          dto.organizationId,
          dto.role,
          scope,
          mgr,
        ),
      });
      return mgr.save(membership);
    });
  }

  async removeMembership(
    userId: string,
    membershipId: string,
    scope: EffectiveScope,
  ): Promise<void> {
    const membership = await this.membershipsRepository.findOne({
      where: { id: membershipId, userId },
      relations: { accessRoles: true },
    });
    if (!membership) throw new NotFoundException('membership 不存在');
    this.scopeService.assertOrgReadable(scope, membership.organizationId);
    this.assertNotSelf(userId, scope);
    this.accessRoles.assertManageable(membership.accessRoles, scope);
    await this.membershipsRepository.delete(membership.id);
  }

  async listMemberships(
    userId: string,
    scope: EffectiveScope,
  ): Promise<UserOrganizationMembership[]> {
    await this.findOneScoped(userId, scope);
    return this.membershipsRepository.find({
      where: {
        userId,
        organizationId: In(scope.type === 'ORG' ? scope.orgIds : []),
      },
      relations: { organization: true, accessRoles: true },
    });
  }

  async updateMembership(
    userId: string,
    id: string,
    dto: UpdateMembershipDto,
    scope: EffectiveScope,
  ) {
    this.assertNotSelf(userId, scope);
    const membership = await this.membershipsRepository.findOne({
      where: { id, userId },
      relations: { accessRoles: true },
    });
    if (!membership) throw new NotFoundException('机构成员关系不存在');
    this.accessRoles.assertManageable(membership.accessRoles, scope);
    const grant = await this.validateGrant(
      { ...dto, organizationId: membership.organizationId },
      scope,
    );
    return this.dataSource.transaction(async (mgr) => {
      Object.assign(membership, grant, {
        role: dto.role,
        isActive: dto.isActive,
        accessRoles: await this.accessRoles.forAssignment(
          dto.roleIds,
          membership.organizationId,
          dto.role,
          scope,
          mgr,
        ),
      });
      return mgr.save(membership);
    });
  }

  private assertNotSelf(userId: string, scope: EffectiveScope) {
    if (scope.type !== 'ORG' || scope.userId === userId)
      throw new ForbiddenException(
        '不能修改或撤销自己的机构授权，请由另一管理员处理',
      );
  }

  private async assertAccountManageable(userId: string, scope: EffectiveScope) {
    this.assertNotSelf(userId, scope);
    if (scope.type !== 'ORG') throw new ForbiddenException();
    const memberships = await this.membershipsRepository.find({
      where: { userId },
      relations: { accessRoles: true },
    });
    this.accessRoles.assertManageable(
      memberships.flatMap((m) => m.accessRoles),
      scope,
    );
    if (
      scope.role !== Role.HQ_ADMIN &&
      memberships.some(
        (m) =>
          !scope.orgIds.includes(m.organizationId) || m.role === Role.HQ_ADMIN,
      )
    )
      throw new ForbiddenException(
        '跨机构账号的全局资料及启停仅总部可维护；请维护本机构授权',
      );
  }

  private async validateGrant(dto: AddMembershipDto, scope: EffectiveScope) {
    this.scopeService.assertOrgReadable(scope, dto.organizationId);
    if (
      scope.type !== 'ORG' ||
      ![Role.HQ_ADMIN, Role.ORG_ADMIN].includes(scope.role)
    )
      throw new ForbiddenException('无权分配机构授权');
    const org = await this.dataSource
      .getRepository(Organization)
      .findOneBy({ id: dto.organizationId, isActive: true });
    if (!org || (dto.role === Role.HQ_ADMIN) !== (org.parentId === null))
      throw new BadRequestException(
        '总部角色仅属于总部；业务角色必须选择有效业务机构',
      );
    if (scope.role !== Role.HQ_ADMIN && dto.role === Role.HQ_ADMIN)
      throw new ForbiddenException('不能授予总部角色');
    let scopeYardId: string | null = null;
    if (dto.role === Role.YARD_STAFF) {
      const yard =
        dto.scopeYardId &&
        (await this.dataSource.getRepository(Yard).findOneBy({
          id: dto.scopeYardId,
          organizationId: org.id,
          isActive: true,
        }));
      if (!yard) throw new BadRequestException('请选择当前机构的有效场地');
      scopeYardId = yard.id;
    }
    return { scopeYardId };
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
