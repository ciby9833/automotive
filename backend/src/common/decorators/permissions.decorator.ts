import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/permission.enum';

export const PERMISSIONS_KEY = 'permissions';

// 声明当前端点需要的功能权限；多个视为"任一命中即可"(OR)。
// 不加此装饰器的端点不做功能权限校验(仍受 JwtAuthGuard + RolesGuard + data scope 约束)。
export const Permissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
