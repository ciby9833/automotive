import { apiClient, unwrap } from './client';
import { Role } from '@/lib/auth/role';

export interface UserMembership {
  id: string;
  organizationId: string;
  role: Role;
  organization?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  scopeYardId: string | null;
  carrierId: string | null;
  customerId: string | null;
  email: string | null;
  isActive: boolean;
  memberships?: UserMembership[];
}

export interface CreateUserPayload {
  username: string;
  password: string;
  displayName: string;
  role: Role; // 只允许 HQ_ADMIN | ORG_ADMIN | YARD_STAFF
  organizationId: string; // 初始 membership 挂在哪个 org
  scopeYardId?: string;
  email?: string;
}

export interface UpdateUserPayload {
  displayName?: string;
  scopeYardId?: string | null;
  email?: string;
  isActive?: boolean;
}

export interface AddMembershipPayload {
  organizationId: string;
  role: Role;
}

export const usersApi = {
  list: () => unwrap<User[]>(apiClient.get('/users')),
  create: (dto: CreateUserPayload) => unwrap<User>(apiClient.post('/users', dto)),
  update: (id: string, dto: UpdateUserPayload) =>
    unwrap<User>(apiClient.patch(`/users/${id}`, dto)),
  deactivate: (id: string) => unwrap<User>(apiClient.patch(`/users/${id}/deactivate`)),
  reactivate: (id: string) => unwrap<User>(apiClient.patch(`/users/${id}/reactivate`)),
  listMemberships: (id: string) =>
    unwrap<UserMembership[]>(apiClient.get(`/users/${id}/memberships`)),
  addMembership: (id: string, dto: AddMembershipPayload) =>
    unwrap<UserMembership>(apiClient.post(`/users/${id}/memberships`, dto)),
  removeMembership: (id: string, membershipId: string) =>
    unwrap(apiClient.delete(`/users/${id}/memberships/${membershipId}`)),
};
