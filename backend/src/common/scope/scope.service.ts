import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Role } from '../enums/role.enum';
import { Organization } from '../../modules/organizations/entities/organization.entity';
import { UserOrganizationMembership } from '../../modules/users/entities/user-organization-membership.entity';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';
import type { EffectiveScope } from './scope.types';

// 所有业务模块统一通过 ScopeService.resolve(user) 得到 EffectiveScope 再查库，
// 不允许 controller/service 自行拼 role 判断——那是权限漏权的高发区。
@Injectable()
export class ScopeService {
  constructor(
    @InjectRepository(UserOrganizationMembership)
    private readonly memRepo: Repository<UserOrganizationMembership>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async resolve(user: AuthenticatedUser): Promise<EffectiveScope> {
    if (user.preAuth) {
      // 预授权令牌不允许调用任何业务接口；理论上被 PreAuthGuard 提前拦，这里再兜一次
      throw new UnauthorizedException('尚未选择机构，无权访问业务数据');
    }

    // 外部账号：CARRIER_STAFF / CARRIER_DRIVER
    if (user.role === Role.CARRIER_STAFF || user.role === Role.CARRIER_DRIVER) {
      if (!user.carrierId) {
        throw new ForbiddenException('外部账号缺少 carrierId 绑定');
      }
      return {
        type: 'CARRIER',
        carrierId: user.carrierId,
        role: user.role,
      };
    }

    // 外部账号：CUSTOMER
    if (user.role === Role.CUSTOMER) {
      if (!user.customerId) {
        throw new ForbiddenException('外部账号缺少 customerId 绑定');
      }
      return {
        type: 'CUSTOMER',
        customerId: user.customerId,
        role: Role.CUSTOMER,
      };
    }

    // 内部账号：activeOrgId 必须已选定
    if (!user.activeOrgId) {
      throw new UnauthorizedException('尚未选择机构');
    }

    // 每次请求都校验 membership 仍然存在（防止管理员撤销权限后旧 token 仍能访问）
    const membership = await this.memRepo.findOne({
      where: { userId: user.userId, organizationId: user.activeOrgId },
    });
    if (!membership) {
      throw new ForbiddenException('对该机构无权限');
    }

    const orgIds = await this.getDescendantOrgIds(user.activeOrgId);

    return {
      type: 'ORG',
      activeOrgId: user.activeOrgId,
      orgIds,
      role: membership.role,
      scopeYardId: user.scopeYardId,
    };
  }

  // 返回 rootId 自身 + 所有子孙节点 id（含自己），用递归 CTE 一次查完。
  async getDescendantOrgIds(rootId: string): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.orgRepo.query(
      `
      WITH RECURSIVE org_tree AS (
        SELECT id FROM organizations WHERE id = $1
        UNION ALL
        SELECT o.id FROM organizations o
          JOIN org_tree t ON o.parent_id = t.id
      )
      SELECT id FROM org_tree
    `,
      [rootId],
    );
    return rows.map((r) => r.id);
  }

  // 写操作前校验：目标机构必须在当前 scope 内；外部账号不允许直接创建 org-scoped 数据
  assertOrgWritable(scope: EffectiveScope, targetOrgId: string): void {
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('外部账号无权创建机构维度数据');
    }
    if (!scope.orgIds.includes(targetOrgId)) {
      throw new ForbiddenException('无权在此机构下创建数据');
    }
  }

  // 通用查询条件应用：把 EffectiveScope 转成 QueryBuilder 的 WHERE 条件。
  // 传入 columnMap 告诉调用者该实体上"org/carrier/customer"字段各自叫什么，
  // 部分实体缺失某类字段时(如 Yard 没有 carrierId)，如果 scope 是该类会直接抛 Forbidden（外部账号看不到这类数据）。
  applyScopeToQuery<T extends object>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    scope: EffectiveScope,
    columnMap: {
      orgIdCol?: string; // 默认 'organizationId'，业务实体必备
      carrierIdCol?: string; // 传了才允许 CARRIER scope 通过
      customerIdCol?: string; // 传了才允许 CUSTOMER scope 通过
      yardIdCols?: string[]; // YARD_STAFF 场地筛选：多列 OR（如 waybill 有 originYardId+destinationYardId）
      narrowToOrgId?: string; // 前端下拉筛选传入的进一步收窄 orgId：必须在 scope.orgIds 内，否则 Forbidden
    } = {},
  ): void {
    const orgCol = columnMap.orgIdCol ?? 'organizationId';

    if (scope.type === 'ORG') {
      // 如果调用方带了 narrowToOrgId（前端"所属机构"筛选下拉），先校验它在 scope 内再收窄
      let effectiveOrgIds = scope.orgIds;
      if (columnMap.narrowToOrgId) {
        if (!scope.orgIds.includes(columnMap.narrowToOrgId)) {
          throw new ForbiddenException('无权按该机构筛选');
        }
        effectiveOrgIds = [columnMap.narrowToOrgId];
      }
      qb.andWhere(`${alias}.${orgCol} IN (:...__scopeOrgIds)`, {
        __scopeOrgIds: effectiveOrgIds,
      });
      if (scope.role === Role.YARD_STAFF && scope.scopeYardId) {
        const yardCols = columnMap.yardIdCols;
        if (yardCols && yardCols.length > 0) {
          const conditions = yardCols
            .map((c, i) => `${alias}.${c} = :__scopeYardId${i}`)
            .join(' OR ');
          const params = yardCols.reduce(
            (acc, _, i) => ({
              ...acc,
              [`__scopeYardId${i}`]: scope.scopeYardId,
            }),
            {} as Record<string, string>,
          );
          qb.andWhere(`(${conditions})`, params);
        }
        // 如果实体不带 yard 列（如 Customer/Carrier），YARD_STAFF 走这里等于看不到该实体列表——
        // 由 Roles 装饰器阻止访问，这里不再收窄。
      }
      return;
    }

    if (scope.type === 'CARRIER') {
      if (!columnMap.carrierIdCol) {
        throw new ForbiddenException('CARRIER 账号无权访问此数据');
      }
      qb.andWhere(`${alias}.${columnMap.carrierIdCol} = :__scopeCarrierId`, {
        __scopeCarrierId: scope.carrierId,
      });
      return;
    }

    if (scope.type === 'CUSTOMER') {
      if (!columnMap.customerIdCol) {
        throw new ForbiddenException('CUSTOMER 账号无权访问此数据');
      }
      qb.andWhere(`${alias}.${columnMap.customerIdCol} = :__scopeCustomerId`, {
        __scopeCustomerId: scope.customerId,
      });
      return;
    }
  }
}
