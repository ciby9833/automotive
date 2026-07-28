import { apiClient, unwrap } from './client';

export type Currency = 'IDR' | 'MYR' | 'THB' | 'VND' | 'PHP';

export interface Organization {
  id: string;
  code: string;
  name: string;
  defaultCurrency: Currency;
  isActive: boolean;
  operatingPolicy?: OrganizationOperatingPolicy;
}

export interface OrganizationOperatingPolicy {
  organizationId: string;
  timezone: string;
  businessDayCutoff: string;
  snapshotEnabled: boolean;
  snapshotStartedAt: string;
  longStayDays: number;
  lockTimeoutHours: number;
  utilizationWarningPercent: number;
  utilizationCriticalPercent: number;
  expectedArrivalWarningHours: number;
}

export const organizationsApi = {
  list: () => unwrap<Organization[]>(apiClient.get('/organizations')),
  create: (dto: {
    code: string;
    name: string;
    defaultCurrency: Currency;
    timezone: string;
    businessDayCutoff: string;
  }) =>
    unwrap<Organization>(apiClient.post('/organizations', dto)),
  updateOperatingPolicy: (
    organizationId: string,
    dto: Partial<
      Pick<
        OrganizationOperatingPolicy,
        | 'timezone'
        | 'businessDayCutoff'
        | 'snapshotEnabled'
        | 'longStayDays'
        | 'lockTimeoutHours'
        | 'utilizationWarningPercent'
        | 'utilizationCriticalPercent'
        | 'expectedArrivalWarningHours'
      >
    >,
  ) =>
    unwrap<OrganizationOperatingPolicy>(
      apiClient.patch(`/organizations/${organizationId}/operating-policy`, dto),
    ),
};
