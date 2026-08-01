import { apiClient, unwrap } from './client';
import type { PartnerStatus } from './carriers';

export interface CustomerAddress {
  id: string;
  customerId: string;
  dealerGroup: string | null;
  dealerName: string;
  address: string;
  code: string | null;
  region: string | null;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  organizationId: string;
  organization?: { id: string; code: string; name: string };
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  status: PartnerStatus;
  addresses?: CustomerAddress[];
}

export interface CustomerAddressPayload {
  dealerGroup?: string;
  dealerName: string;
  address: string;
  code?: string;
  region?: string;
  contactName?: string;
  contactPhone?: string;
  isActive?: boolean;
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
  update: (
    id: string,
    dto: Partial<{
      name: string;
      contactName: string | null;
      contactPhone: string | null;
      email: string | null;
      quotationNote: string | null;
    }>,
  ) => unwrap<Customer>(apiClient.patch(`/customers/${id}`, dto)),
  setStatus: (id: string, status: PartnerStatus) =>
    unwrap<{ customer: Customer; inflightCount: number }>(
      apiClient.patch(`/customers/${id}/status`, { status }),
    ),
  addAddress: (customerId: string, dto: CustomerAddressPayload) =>
    unwrap<CustomerAddress>(
      apiClient.post(`/customers/${customerId}/addresses`, dto),
    ),
  importAddresses: (customerId: string, addresses: CustomerAddressPayload[]) =>
    unwrap<{ created: number; updated: number; skipped: number }>(
      apiClient.post(`/customers/${customerId}/addresses/import`, {
        addresses,
      }),
    ),
  updateAddress: (
    addressId: string,
    dto: Partial<CustomerAddressPayload>,
  ) =>
    unwrap<CustomerAddress>(
      apiClient.patch(`/customers/addresses/${addressId}`, dto),
    ),
  deleteAddress: (addressId: string) =>
    unwrap<{ ok: boolean }>(
      apiClient.delete(`/customers/addresses/${addressId}`),
    ),
};
