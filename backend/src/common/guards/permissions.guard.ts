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
import { PUBLIC_KEY, SESSION_ONLY_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

// 全局默认拒绝；基于本次请求加载的有效许可检查，不信任前端或 JWT 内的角色声明。
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      [PUBLIC_KEY, SESSION_ONLY_KEY].some((key) =>
        this.reflector.getAllAndOverride(key, [
          context.getHandler(),
          context.getClass(),
        ]),
      )
    )
      return true;
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) throw new ForbiddenException('接口尚未声明功能权限');

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user || user.preAuth) throw new ForbiddenException('未完成身份授权');

    const granted = new Set(user.permissions ?? []);
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
