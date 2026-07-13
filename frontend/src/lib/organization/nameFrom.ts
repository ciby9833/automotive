'use client';

import type { Locale } from '@/i18n/store';
import { localizedOrganizationName } from '@/i18n/organizationNames';
import type { Organization } from '@/lib/api/organizations';

// 优先用记录里带的 organization 对象（外部账号 useOrganizations() 会为空），
// 其次用组织列表做 id→name 映射，最后 fallback 到 id 本身。
export function orgNameFromRecord(
  record: { organization?: { code?: string; name?: string } | null } | undefined,
  organizationId: string | null | undefined,
  organizations: Organization[],
  locale: Locale,
): string {
  if (record?.organization?.code && record?.organization?.name) {
    return localizedOrganizationName(
      record.organization.code,
      record.organization.name,
      locale,
    );
  }
  if (!organizationId) return '-';
  const found = organizations.find((o) => o.id === organizationId);
  if (found) return localizedOrganizationName(found.code, found.name, locale);
  return organizationId;
}
