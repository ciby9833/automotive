import { apiClient, unwrap } from './client';
import { Role } from '@/lib/auth/role';

export type InvitationTargetType = 'CARRIER' | 'CUSTOMER';

export interface Invitation {
  id: string;
  token: string;
  targetType: InvitationTargetType;
  targetId: string;
  inviteeRole: Role;
  expiresAt: string;
  usedByUserId: string | null;
}

export interface InvitationPreview {
  targetType: InvitationTargetType;
  targetName: string;
  inviteeRole: Role;
  expiresAt: string;
}

export const invitationsApi = {
  createForCarrier: (carrierId: string, dto: { inviteeRole: Role; ttlDays?: number }) =>
    unwrap<Invitation>(apiClient.post(`/carriers/${carrierId}/invitations`, dto)),
  createForCustomer: (customerId: string, dto: { inviteeRole: Role; ttlDays?: number }) =>
    unwrap<Invitation>(apiClient.post(`/customers/${customerId}/invitations`, dto)),
  preview: (token: string) =>
    unwrap<InvitationPreview>(apiClient.get(`/public/invitations/${token}`)),
  register: (dto: {
    token: string;
    username: string;
    password: string;
    displayName: string;
    email?: string;
  }) => unwrap<{ userId: string }>(apiClient.post('/public/register-with-invitation', dto)),
};
