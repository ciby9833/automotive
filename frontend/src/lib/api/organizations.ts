import { apiClient, unwrap } from './client';

export type Currency = 'IDR' | 'MYR' | 'THB' | 'VND' | 'PHP';

export interface Organization {
  id: string;
  code: string;
  name: string;
  defaultCurrency: Currency;
  isActive: boolean;
}

export const organizationsApi = {
  list: () => unwrap<Organization[]>(apiClient.get('/organizations')),
  create: (dto: { code: string; name: string; defaultCurrency: Currency }) =>
    unwrap<Organization>(apiClient.post('/organizations', dto)),
};
