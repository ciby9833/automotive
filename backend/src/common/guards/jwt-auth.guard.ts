import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) { super(); }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride(PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    // 控制器复用该 guard 时，沿用本次请求已解析的身份，不再查库。
    if (context.switchToHttp().getRequest().user) return true;
    return super.canActivate(context) as Promise<boolean>;
  }
}
