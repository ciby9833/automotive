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
};
