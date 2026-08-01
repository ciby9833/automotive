import { apiClient, unwrap } from './client';

export type CarrierType = 'EXTERNAL' | 'SELF_OWNED';
export type PartnerStatus = 'ACTIVE' | 'PAUSED' | 'INACTIVE';

export interface Carrier {
  id: string;
  organizationId: string;
  organization?: { id: string; code: string; name: string };
  name: string;
  type: CarrierType;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  status: PartnerStatus;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  licenseNo: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankName: string | null;
  isActive: boolean;
  carrierId: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  towType: string | null;
  isActive: boolean;
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
  update: (
    id: string,
    dto: Partial<{
      name: string;
      shortName: string | null;
      type: CarrierType;
      contactName: string | null;
      contactPhone: string | null;
      email: string | null;
      quotationNote: string | null;
    }>,
  ) => unwrap<Carrier>(apiClient.patch(`/carriers/${id}`, dto)),
  setStatus: (id: string, status: PartnerStatus) =>
    unwrap<{ carrier: Carrier; inflightCount: number }>(
      apiClient.patch(`/carriers/${id}/status`, { status }),
    ),
  listDrivers: (carrierId: string, includeInactive = false) =>
    unwrap<Driver[]>(
      apiClient.get(`/carriers/${carrierId}/drivers`, {
        params: includeInactive ? { includeInactive: 'true' } : undefined,
      }),
    ),
  listVehicles: (carrierId: string, includeInactive = false) =>
    unwrap<Vehicle[]>(
      apiClient.get(`/carriers/${carrierId}/vehicles`, {
        params: includeInactive ? { includeInactive: 'true' } : undefined,
      }),
    ),
  addDriver: (
    carrierId: string,
    dto: {
      name: string;
      phone?: string;
      licenseNo?: string;
      bankAccountName?: string;
      bankAccountNo?: string;
      bankName?: string;
    },
  ) => unwrap<Driver>(apiClient.post(`/carriers/${carrierId}/drivers`, dto)),
  updateDriver: (
    carrierId: string,
    driverId: string,
    dto: Partial<{
      name: string;
      phone: string | null;
      licenseNo: string | null;
      bankAccountName: string | null;
      bankAccountNo: string | null;
      bankName: string | null;
    }>,
  ) =>
    unwrap<Driver>(
      apiClient.patch(`/carriers/${carrierId}/drivers/${driverId}`, dto),
    ),
  deactivateDriver: (carrierId: string, driverId: string) =>
    unwrap<Driver>(
      apiClient.patch(
        `/carriers/${carrierId}/drivers/${driverId}/deactivate`,
      ),
    ),
  reactivateDriver: (carrierId: string, driverId: string) =>
    unwrap<Driver>(
      apiClient.patch(
        `/carriers/${carrierId}/drivers/${driverId}/reactivate`,
      ),
    ),
  deleteDriver: (carrierId: string, driverId: string) =>
    unwrap<{ ok: boolean }>(
      apiClient.delete(`/carriers/${carrierId}/drivers/${driverId}`),
    ),
  addVehicle: (carrierId: string, dto: { plateNumber: string; towType?: string }) =>
    unwrap<Vehicle>(apiClient.post(`/carriers/${carrierId}/vehicles`, dto)),
  updateVehicle: (
    carrierId: string,
    vehicleId: string,
    dto: Partial<{ plateNumber: string; towType: string | null }>,
  ) =>
    unwrap<Vehicle>(
      apiClient.patch(`/carriers/${carrierId}/vehicles/${vehicleId}`, dto),
    ),
  deactivateVehicle: (carrierId: string, vehicleId: string) =>
    unwrap<Vehicle>(
      apiClient.patch(
        `/carriers/${carrierId}/vehicles/${vehicleId}/deactivate`,
      ),
    ),
  reactivateVehicle: (carrierId: string, vehicleId: string) =>
    unwrap<Vehicle>(
      apiClient.patch(
        `/carriers/${carrierId}/vehicles/${vehicleId}/reactivate`,
      ),
    ),
  deleteVehicle: (carrierId: string, vehicleId: string) =>
    unwrap<{ ok: boolean }>(
      apiClient.delete(`/carriers/${carrierId}/vehicles/${vehicleId}`),
    ),

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
