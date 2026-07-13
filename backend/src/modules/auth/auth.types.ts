import { Role } from '../../common/enums/role.enum';

// JWT payload / 请求上下文里的用户身份信息
// 分预授权(preAuth=true) 和 完整授权(preAuth=false) 两种：
//  - 预授权仅在多 membership 登录后、用户尚未选择机构时下发，只允许调用 /auth/select-org 与 /auth/logout
//  - 完整授权含 activeOrgId(内部账号) 或 carrierId/customerId(外部账号)
export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: Role; // 账号类型（首要角色，非 membership 内跨 org 的动态角色）
  preAuth: boolean;
  // 内部账号：当前会话已选定的机构；未选择或外部账号 → null
  activeOrgId: string | null;
  // YARD_STAFF 专属
  scopeYardId: string | null;
  // 外部账号专属
  carrierId: string | null;
  customerId: string | null;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  preAuth: boolean;
  activeOrgId: string | null;
  scopeYardId: string | null;
  carrierId: string | null;
  customerId: string | null;
}
