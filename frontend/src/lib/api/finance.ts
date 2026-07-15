import { apiClient, unwrap } from './client';
import { Currency } from './organizations';

export type FinanceRecordType = 'REVENUE' | 'COST' | 'TRAVEL_EXPENSE';
export type FinanceStatus = 'PENDING' | 'CONFIRMED' | 'SUBMITTED_OA';

export interface FinanceRecord {
  id: string;
  waybillId: string;
  organizationId: string;
  waybill?: { organization?: { id: string; code: string; name: string } };
  type: FinanceRecordType;
  amount: string;
  currency: Currency;
  status: FinanceStatus;
  invoiceRef: string | null;
}

export const financeApi = {
  list: (params?: {
    customerId?: string;
    carrierId?: string;
    organizationId?: string;
  }) => unwrap<FinanceRecord[]>(apiClient.get('/finance', { params })),
  confirm: (id: string) => unwrap<FinanceRecord>(apiClient.patch(`/finance/${id}/confirm`)),
  notifyCustomer: (customerId: string) =>
    unwrap<{ message: string }>(apiClient.post(`/finance/customers/${customerId}/notify`)),
};
