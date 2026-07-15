import { apiClient, unwrap } from './client';

export interface Customer {
  id: string;
  organizationId: string;
  organization?: { id: string; code: string; name: string };
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  isActive: boolean;
}

export const customersApi = {
  list: (organizationId?: string) =>
    unwrap<Customer[]>(apiClient.get('/customers', { params: { organizationId } })),
  get: (id: string) => unwrap<Customer>(apiClient.get(`/customers/${id}`)),
  create: (dto: {
    organizationId: string;
    name: string;
    contactName?: string;
    contactPhone?: string;
    email?: string;
  }) => unwrap<Customer>(apiClient.post('/customers', dto)),
  addAddress: (
    customerId: string,
    dto: { dealerName: string; address: string; contactName?: string; contactPhone?: string },
  ) => unwrap(apiClient.post(`/customers/${customerId}/addresses`, dto)),
};
