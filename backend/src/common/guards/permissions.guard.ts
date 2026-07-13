import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../enums/permission.enum';
import { permissionsForRole } from '../rbac/role-permissions';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

// 全局注册后，只对声明了 @Permissions() 的端点做校验；未声明的透传。
// 校验逻辑：根据当前 user.role 查 ROLE_PERMISSIONS，若与端点声明有交集则放行。
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) return true; // 未经 JwtAuthGuard 的路由；此 guard 不干预

    const granted = new Set(permissionsForRole(user.role));
    const hasAny = required.some((p) => granted.has(p));
    if (!hasAny) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_MISSING_PERMISSION',
        message: '当前账号缺少所需功能权限',
        required,
      });
    }
    return true;
  }
}
