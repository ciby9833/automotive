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
  addDriver: (
    carrierId: string,
    dto: { name: string; phone?: string; licenseNo?: string },
  ) => unwrap(apiClient.post(`/carriers/${carrierId}/drivers`, dto)),
  addVehicle: (carrierId: string, dto: { plateNumber: string; towType?: string }) =>
    unwrap(apiClient.post(`/carriers/${carrierId}/vehicles`, dto)),
};
