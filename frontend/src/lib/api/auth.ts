import { apiClient, unwrap } from './client';
import {
  AccountUnit,
  AuthUser,
  ExternalContext,
  LoginMode,
  Membership,
} from '../auth/store';

export interface LoginResponse {
  mode: LoginMode;
  accessToken: string;
  user: AuthUser;
  memberships?: Membership[];
  activeOrgId?: string | null;
  externalContext?: ExternalContext;
  accountUnit?: AccountUnit | null;
  permissions: string[];
}

export function login(username: string, password: string) {
  return unwrap<LoginResponse>(apiClient.post('/auth/login', { username, password }));
}

// 用预授权 token 选定一个机构，换取完整 token
export function selectOrg(organizationId: string) {
  return unwrap<LoginResponse>(apiClient.post('/auth/select-org', { organizationId }));
}

// 已登录状态切换机构，后端换发新 token
export function switchOrg(organizationId: string) {
  return unwrap<LoginResponse>(apiClient.post('/auth/switch-org', { organizationId }));
}

export function forgotPassword(email: string) {
  return unwrap<{ message: string }>(apiClient.post('/auth/forgot-password', { email }));
}

export function resetPassword(token: string, newPassword: string) {
  return unwrap<{ message: string }>(
    apiClient.post('/auth/reset-password', { token, newPassword }),
  );
}
