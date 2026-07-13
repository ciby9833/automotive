import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { UserOrganizationMembership } from '../users/entities/user-organization-membership.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { JwtPayload } from './auth.types';
import { ErrorCode } from '../../common/constants/error-codes';
import { Role } from '../../common/enums/role.enum';
import { Permission } from '../../common/enums/permission.enum';
import { permissionsForRole } from '../../common/rbac/role-permissions';

// 登录返回三种模式，前端据此决定后续动作：
//  - EXTERNAL: 外部账号，直接给完整 token 进业务
//  - SINGLE_ORG: 内部账号只有一个 membership，直接给完整 token（activeOrgId 已确定）
//  - NEEDS_SELECTION: 内部账号有多 membership，给预授权 token，前端弹选择器，用户 POST /auth/select-org 换完整 token
export type LoginMode = 'EXTERNAL' | 'SINGLE_ORG' | 'NEEDS_SELECTION';

export interface MembershipSummary {
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  role: Role;
}

export interface LoginResult {
  mode: LoginMode;
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    email: string | null;
  };
  // 内部账号才会返回，用来渲染选择器/切换菜单
  memberships?: MembershipSummary[];
  // SINGLE_ORG 时 activeOrg 已定，NEEDS_SELECTION 时为 null
  activeOrgId?: string | null;
  // 外部账号才会返回
  externalContext?: {
    carrierId: string | null;
    customerId: string | null;
  };
  // 当前角色的功能权限清单；前端据此驱动按钮可见性
  permissions: Permission[];
}

const EXTERNAL_ROLES = new Set([
  Role.CARRIER_STAFF,
  Role.CARRIER_DRIVER,
  Role.CUSTOMER,
]);

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @InjectRepository(UserOrganizationMembership)
    private readonly memRepo: Repository<UserOrganizationMembership>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: '用户名或密码错误',
      });
    }
    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_ACCOUNT_DISABLED,
        message: '账号已被停用',
      });
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: '用户名或密码错误',
      });
    }

    const publicUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      email: user.email,
    };

    // 外部账号：不查 membership，直接下发完整 token
    if (EXTERNAL_ROLES.has(user.role)) {
      if (!user.carrierId && !user.customerId) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_INVALID_CREDENTIALS,
          message: '外部账号未正确绑定归属实体',
        });
      }
      const token = this.signToken({
        sub: user.id,
        username: user.username,
        role: user.role,
        preAuth: false,
        activeOrgId: null,
        scopeYardId: null,
        carrierId: user.carrierId,
        customerId: user.customerId,
      });
      return {
        mode: 'EXTERNAL',
        accessToken: token,
        user: publicUser,
        externalContext: {
          carrierId: user.carrierId,
          customerId: user.customerId,
        },
        permissions: permissionsForRole(user.role),
      };
    }

    // 内部账号：查所有 memberships
    const memberships = await this.getMembershipSummaries(user.id);
    if (memberships.length === 0) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: '账号未分配任何机构，请联系管理员',
      });
    }

    if (memberships.length === 1) {
      const only = memberships[0];
      const token = this.signToken({
        sub: user.id,
        username: user.username,
        role: user.role,
        preAuth: false,
        activeOrgId: only.organizationId,
        scopeYardId: user.scopeYardId,
        carrierId: null,
        customerId: null,
      });
      return {
        mode: 'SINGLE_ORG',
        accessToken: token,
        user: publicUser,
        memberships,
        activeOrgId: only.organizationId,
        permissions: permissionsForRole(user.role),
      };
    }

    // 多 membership：下发预授权 token，前端弹选择器
    const preAuthToken = this.signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      preAuth: true,
      activeOrgId: null,
      scopeYardId: user.scopeYardId,
      carrierId: null,
      customerId: null,
    });
    return {
      mode: 'NEEDS_SELECTION',
      accessToken: preAuthToken,
      user: publicUser,
      memberships,
      activeOrgId: null,
      // NEEDS_SELECTION 时权限清单也一起返回，选完机构不用二次请求
      permissions: permissionsForRole(user.role),
    };
  }

  // 用预授权 token 挑一个 org 换取完整 token
  async selectOrg(
    userId: string,
    organizationId: string,
  ): Promise<LoginResult> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('账号不存在或已停用');
    }
    if (EXTERNAL_ROLES.has(user.role)) {
      throw new ForbiddenException('外部账号无需选择机构');
    }
    const membership = await this.memRepo.findOne({
      where: { userId, organizationId },
    });
    if (!membership) {
      throw new ForbiddenException('无权访问此机构');
    }
    const memberships = await this.getMembershipSummaries(userId);
    const token = this.signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      preAuth: false,
      activeOrgId: organizationId,
      scopeYardId: user.scopeYardId,
      carrierId: null,
      customerId: null,
    });
    return {
      mode: 'SINGLE_ORG',
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        email: user.email,
      },
      memberships,
      activeOrgId: organizationId,
      permissions: permissionsForRole(user.role),
    };
  }

  // 已登录状态切换机构：和 selectOrg 逻辑相同，但要求当前 token 已经是完整授权
  async switchOrg(
    userId: string,
    organizationId: string,
  ): Promise<LoginResult> {
    return this.selectOrg(userId, organizationId);
  }

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  private async getMembershipSummaries(
    userId: string,
  ): Promise<MembershipSummary[]> {
    const rows = await this.memRepo.find({
      where: { userId },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((m) => ({
      organizationId: m.organizationId,
      organizationCode: m.organization.code,
      organizationName: m.organization.name,
      role: m.role,
    }));
  }

  async forgotPassword(email: string): Promise<void> {
    const result = await this.usersService.createPasswordResetToken(email);
    if (result) {
      await this.emailService.sendPasswordResetEmail(
        email,
        result.user.displayName,
        result.token,
      );
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.usersService.resetPasswordByToken(token, newPassword);
  }
}
