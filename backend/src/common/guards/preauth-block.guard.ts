import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

// 元数据 key：在 controller 方法上加 @AllowPreAuth() 即可绕过此 guard（仅 /auth/select-org & /auth/logout 用）
export const ALLOW_PREAUTH_KEY = 'allow_preauth';

// 全局启用：JWT 通过 passport 校验之后，本 guard 二次校验 preAuth 标志。
// preAuth=true 的 token 除非目标端点显式声明 @AllowPreAuth()，否则一律 401。
// 这是"预授权 token 不能碰业务数据"这条硬约束在框架层的兜底。
@Injectable()
export class PreAuthBlockGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) return true; // 未经过 JwtAuthGuard 的路由（如 public 接口），此 guard 不干预
    if (!user.preAuth) return true; // 正常完整授权

    const allowsPreAuth = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PREAUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowsPreAuth) return true;

    throw new UnauthorizedException({
      code: 'AUTH_NEEDS_ORG_SELECTION',
      message: '尚未选择机构，无权访问此接口',
    });
  }
}
