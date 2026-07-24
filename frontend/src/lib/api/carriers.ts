import { apiClient, unwrap } from './client';

export type CarrierType = 'EXTERNAL' | 'SELF_OWNED';

export interface Carrier {
  id: string;
  organizationId: string;
  organization?: { id: string; code: string; name: string };
  name: string;
  type: CarrierType;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  isActive: boolean;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  licenseNo: string | null;
  carrierId: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  towType: string | null;
  carrierId: string;
}

export const carriersApi = {
  list: (organizationId?: string) =>
    unwrap<Carrier[]>(apiClient.get('/carriers', { params: { organizationId } })),
  get: (id: string) => unwrap<Carrier>(apiClient.get(`/carriers/${id}`)),
  create: (dto: {
    organizationId: string;
    name: string;
    type: CarrierType;
    contactName?: string;
    contactPhone?: string;
    email?: string;
  }) => unwrap<Carrier>(apiClient.post('/carriers', dto)),
  listDrivers: (carrierId: string) =>
    unwrap<Driver[]>(apiClient.get(`/carriers/${carrierId}/drivers`)),
  listVehicles: (carrierId: string) =>
    unwrap<Vehicle[]>(apiClient.get(`/carriers/${carrierId}/vehicles`)),
  addDriver: (
    carrierId: string,
    dto: { name: string; phone?: string; licenseNo?: string },
  ) => unwrap<Driver>(apiClient.post(`/carriers/${carrierId}/drivers`, dto)),
  addVehicle: (carrierId: string, dto: { plateNumber: string; towType?: string }) =>
    unwrap<Vehicle>(apiClient.post(`/carriers/${carrierId}/vehicles`, dto)),

  // ============ 承运商账号管理 ============
  listUsers: (
    carrierId: string,
    params?: { keyword?: string; role?: 'CARRIER_STAFF' | 'CARRIER_DRIVER'; active?: boolean },
  ) =>
    unwrap<CarrierUser[]>(
      apiClient.get(`/carriers/${carrierId}/users`, { params }),
    ),
  createUser: (
    carrierId: string,
    dto: {
      username: string;
      password: string;
      displayName: string;
      role: 'CARRIER_STAFF' | 'CARRIER_DRIVER';
      email?: string;
    },
  ) => unwrap<CarrierUser>(apiClient.post(`/carriers/${carrierId}/users`, dto)),
  updateUser: (
    carrierId: string,
    userId: string,
    dto: { displayName?: string; email?: string | null },
  ) =>
    unwrap<CarrierUser>(
      apiClient.patch(`/carriers/${carrierId}/users/${userId}`, dto),
    ),
  deactivateUser: (carrierId: string, userId: string) =>
    unwrap<CarrierUser>(
      apiClient.patch(`/carriers/${carrierId}/users/${userId}/deactivate`),
    ),
  reactivateUser: (carrierId: string, userId: string) =>
    unwrap<CarrierUser>(
      apiClient.patch(`/carriers/${carrierId}/users/${userId}/reactivate`),
    ),
  resetUserPassword: (carrierId: string, userId: string) =>
    unwrap<{ username: string; temporaryPassword: string }>(
      apiClient.post(`/carriers/${carrierId}/users/${userId}/reset-password`),
    ),
};

export interface CarrierUser {
  id: string;
  username: string;
  displayName: string;
  role: 'CARRIER_STAFF' | 'CARRIER_DRIVER';
  email: string | null;
  isActive: boolean;
  createdAt: string;
}
