'use client';

import { Select } from 'antd';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';

// 各列表页顶部的"所属机构"筛选下拉：仅当当前用户可见的机构数量 > 1 时才渲染
// 传空表示"全部(scope 允许的所有机构)"，选中一个后请求带 ?organizationId=X 收窄
export function OrgFilter({
  value,
  onChange,
  width = 200,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  width?: number;
}) {
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  if (organizations.length <= 1) return null;

  return (
    <Select
      allowClear
      placeholder={t('organization.filterPlaceholder')}
      style={{ width }}
      value={value}
      onChange={onChange}
      options={organizations.map((o) => ({
        value: o.id,
        label: localizedOrganizationName(o.code, o.name, locale),
      }))}
    />
  );
}
