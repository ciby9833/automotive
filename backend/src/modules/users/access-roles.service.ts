import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { ScopeService } from '../../common/scope/scope.service';
import { EffectiveScope, OrgScope } from '../../common/scope/scope.types';
import { Role } from '../../common/enums/role.enum';
import { Permission as P } from '../../common/enums/permission.enum';
import {
  ACTIONS,
  MENUS,
  effectivePermissions,
  expandPermissions,
} from '../../common/rbac/permission-catalog';
import { AccessRole } from './entities/access-role.entity';
import { Organization } from '../organizations/entities/organization.entity';
import {
  CreateAccessRoleDto,
  RoleScopeDto,
  UpdateAccessRoleDto,
} from './dto/access-role.dto';

@Injectable()
export class AccessRolesService {
  private readonly logger = new Logger(AccessRolesService.name);
  constructor(
    private readonly db: DataSource,
    private readonly scopes: ScopeService,
  ) {}

  async target(
    scope: EffectiveScope,
    organizationId: string,
    type?: Role,
  ): Promise<OrgScope> {
    this.scopes.assertOrgReadable(scope, organizationId);
    if (scope.type !== 'ORG') throw new ForbiddenException();
    const org = await this.db
      .getRepository(Organization)
      .findOneBy({ id: organizationId, isActive: true });
    if (!org) throw new BadRequestException('请选择有效机构');
    if (type && (type === Role.HQ_ADMIN) !== (org.parentId === null))
      throw new BadRequestException(
        '总部范围仅用于总部，机构/场地范围仅用于业务机构',
      );
    return scope;
  }

  async catalog(query: RoleScopeDto, scope: EffectiveScope) {
    await this.target(scope, query.organizationId, query.type);
    const type = query.type;
    if (!type) throw new BadRequestException('请选择账号范围');
    return MENUS.filter((m) => m.types.includes(type)).map((m) => ({
      ...m,
      selectable: this.canDelegate(scope, expandPermissions([m.permission])),
      actions: m.actions
        .filter((p) => ACTIONS[p].types.includes(type))
        .map((code) => ({
          code,
          selectable: this.canDelegate(
            scope,
            expandPermissions([m.permission, code]),
          ),
        })),
    }));
  }

  private canDelegate(scope: EffectiveScope, permissions: string[]) {
    return (
      scope.type === 'ORG' &&
      (scope.role === Role.HQ_ADMIN ||
        permissions.every((p) => scope.permissions?.includes(p)))
    );
  }

  assertManageable(roles: AccessRole[], scope: EffectiveScope) {
    if (
      roles.some(
        (r) =>
          !this.canDelegate(scope, effectivePermissions(r.type, r.permissions)),
      )
    )
      throw new ForbiddenException(
        '不能调整权限高于自身的账号授权，请由总部或相应授权管理员处理',
      );
  }

  private validatePermissions(
    type: Role,
    permissions: string[],
    scope: EffectiveScope,
  ) {
    const menus = MENUS.filter((m) => m.types.includes(type));
    for (const p of permissions) {
      if (menus.some((m) => m.permission === p)) continue;
      if (
        !ACTIONS[p as P]?.types.includes(type) ||
        !menus.some(
          (m) =>
            permissions.includes(m.permission) && m.actions.includes(p as P),
        )
      )
        throw new BadRequestException(
          `功能 ${p} 未登记、超出账号范围或缺少所属菜单`,
        );
    }
    if (!this.canDelegate(scope, expandPermissions(permissions)))
      throw new ForbiddenException('不能授予超出自身授权范围的菜单或功能');
    return [...new Set(permissions)].sort();
  }

  async list(query: RoleScopeDto, scope: EffectiveScope, assignable = false) {
    await this.target(scope, query.organizationId, query.type);
    const rows = await this.db.getRepository(AccessRole).find({
      where: {
        organizationId: query.organizationId,
        ...(query.type ? { type: query.type } : {}),
      },
      order: { createdAt: 'ASC' },
    });
    const counts: Array<{ id: string; count: number }> = await this.db.query(
      `SELECT r.id, count(m.membership_id)::int count
      FROM access_roles r LEFT JOIN membership_access_roles m ON m.role_id=r.id
      WHERE r.organization_id=$1 GROUP BY r.id`,
      [query.organizationId],
    );
    const own: Array<{ role_id: string }> = await this.db.query(
      `SELECT mr.role_id FROM membership_access_roles mr
       JOIN user_organization_memberships m ON m.id=mr.membership_id WHERE m.user_id=$1`,
      [scope.type === 'ORG' ? scope.userId : null],
    );
    const ownIds = new Set(own.map((r) => r.role_id));
    return rows
      .filter(
        (r) =>
          !assignable ||
          (r.isActive &&
            this.canDelegate(
              scope,
              effectivePermissions(r.type, r.permissions),
            )),
      )
      .map((r) => ({
        ...r,
        assignedCount: counts.find((c) => c.id === r.id)?.count ?? 0,
        canManage:
          scope.type === 'ORG' &&
          !!scope.permissions?.includes(P.SETUP_ROLE_MANAGE) &&
          this.canDelegate(scope, effectivePermissions(r.type, r.permissions)),
        isAssignedToSelf: ownIds.has(r.id),
      }));
  }

  async create(dto: CreateAccessRoleDto, scope: EffectiveScope) {
    await this.target(scope, dto.organizationId, dto.type);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('角色名称不能为空');
    const permissions = this.validatePermissions(
      dto.type,
      dto.permissions,
      scope,
    );
    try {
      const saved = await this.db.getRepository(AccessRole).save({
        ...dto,
        name,
        description: dto.description ?? '',
        permissions,
        isActive: true,
      });
      this.logger.log(
        JSON.stringify({
          event: 'ROLE_CREATE',
          roleId: saved.id,
          organizationId: saved.organizationId,
          actor: scope.type === 'ORG' ? scope.userId : null,
          permissions,
        }),
      );
      return saved;
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('当前机构已存在同名角色');
      throw e;
    }
  }

  async update(id: string, dto: UpdateAccessRoleDto, scope: EffectiveScope) {
    return this.db.transaction(async (mgr) => {
      const role = await mgr
        .getRepository(AccessRole)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!role) throw new NotFoundException('角色不存在');
      await this.target(scope, role.organizationId, role.type);
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('角色名称不能为空');
      if (
        !this.canDelegate(
          scope,
          effectivePermissions(role.type, role.permissions),
        )
      )
        throw new ForbiddenException('不能维护超出自身授权范围的角色');
      const permissions = this.validatePermissions(
        role.type,
        dto.permissions,
        scope,
      );
      const changed =
        JSON.stringify([...role.permissions].sort()) !==
          JSON.stringify(permissions) || role.isActive !== dto.isActive;
      if (changed) {
        const own = await mgr.query<Array<{ exists: number }>>(
          `SELECT 1 FROM membership_access_roles mr JOIN user_organization_memberships m ON m.id=mr.membership_id
          WHERE mr.role_id=$1 AND m.user_id=$2 LIMIT 1`,
          [id, scope.type === 'ORG' ? scope.userId : null],
        );
        if (own.length)
          throw new ForbiddenException(
            '不能修改分配给自己的角色权限，请由另一授权管理员处理',
          );
      }
      if (!dto.isActive && role.isActive) {
        const [used] = await mgr.query<Array<{ count: number }>>(
          'SELECT count(*)::int count FROM membership_access_roles WHERE role_id=$1',
          [id],
        );
        if (used.count)
          throw new ConflictException(
            `角色已分配给 ${used.count} 个机构成员，请先调整其角色`,
          );
      }
      const before = role.permissions;
      Object.assign(role, {
        name,
        description: dto.description ?? '',
        permissions,
        isActive: dto.isActive,
      });
      try {
        const saved = await mgr.save(role);
        this.logger.log(
          JSON.stringify({
            event: 'ROLE_UPDATE',
            roleId: id,
            organizationId: role.organizationId,
            actor: scope.type === 'ORG' ? scope.userId : null,
            before,
            permissions,
          }),
        );
        return saved;
      } catch (e) {
        if (
          e instanceof QueryFailedError &&
          (e.driverError as { code?: string }).code === '23505'
        )
          throw new ConflictException('当前机构已存在同名角色');
        throw e;
      }
    });
  }

  async forAssignment(
    ids: string[],
    organizationId: string,
    type: Role,
    scope: EffectiveScope,
    mgr: EntityManager,
  ) {
    if (!ids.length) return [];
    if (
      scope.type !== 'ORG' ||
      !scope.permissions?.includes(P.SETUP_USER_MEMBERSHIP)
    )
      throw new ForbiddenException('分配角色需要用户角色分配权限');
    const roles = await mgr
      .getRepository(AccessRole)
      .find({ where: { id: In(ids) }, lock: { mode: 'pessimistic_read' } });
    if (
      roles.length !== ids.length ||
      roles.some(
        (r) =>
          !r.isActive || r.organizationId !== organizationId || r.type !== type,
      )
    )
      throw new BadRequestException('只能分配本机构、同账号范围且已启用的角色');
    if (
      roles.some(
        (r) =>
          !this.canDelegate(scope, effectivePermissions(type, r.permissions)),
      )
    )
      throw new ForbiddenException('不能分配超出自身权限范围的角色');
    return roles;
  }
}
