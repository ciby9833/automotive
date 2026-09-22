import { apiClient, unwrap } from "./client";

export type Currency = "IDR" | "MYR" | "THB" | "VND" | "PHP";

export interface Organization {
  id: string;
  code: string;
  name: string;
  defaultCurrency: Currency;
  isActive: boolean;
  parentId: string | null;
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
  list: () => unwrap<Organization[]>(apiClient.get("/organizations")),
  management: () =>
    unwrap<Organization[]>(apiClient.get("/organizations/management")),
  create: (dto: {
    code: string;
    name: string;
    defaultCurrency: Currency;
    timezone: string;
    businessDayCutoff: string;
    parentId: string;
  }) => unwrap<Organization>(apiClient.post("/organizations", dto)),
  update: (
    id: string,
    dto: Partial<
      Pick<Organization, "code" | "name" | "parentId" | "defaultCurrency">
    >,
  ) => unwrap<Organization>(apiClient.patch(`/organizations/${id}`, dto)),
  setActive: (id: string, isActive: boolean) =>
    unwrap<Organization>(
      apiClient.patch(`/organizations/${id}/status`, { isActive }),
    ),
  updateOperatingPolicy: (
    organizationId: string,
    dto: Partial<
      Pick<
        OrganizationOperatingPolicy,
        | "timezone"
        | "businessDayCutoff"
        | "snapshotEnabled"
        | "longStayDays"
        | "lockTimeoutHours"
        | "utilizationWarningPercent"
        | "utilizationCriticalPercent"
        | "expectedArrivalWarningHours"
      >
    >,
  ) =>
    unwrap<OrganizationOperatingPolicy>(
      apiClient.patch(`/organizations/${organizationId}/operating-policy`, dto),
    ),
};
