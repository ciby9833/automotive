import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
// 仅会话管理接口使用；业务接口必须声明 @Permissions。
export const SESSION_ONLY_KEY = 'session_only';
export const SessionOnly = () => SetMetadata(SESSION_ONLY_KEY, true);
