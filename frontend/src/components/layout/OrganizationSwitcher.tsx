'use client';

import { Select, message } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { switchOrg } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';
import { useLayoutStore } from './layoutStore';

// 顶栏机构切换器：显示当前用户所有 membership，切换时后端换发新 token，前端硬重载
// 硬重载而不是走 SPA 路由：所有页面都是 useState+useEffect 拉数据，不重载会有旧数据残留
// 外部账号不展示此组件（AppShell 里已判断），因此这里假设 memberships 非空
export function OrganizationSwitcher() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const memberships = useAuthStore((s) => s.memberships);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearTabs = useLayoutStore((s) => s.clearTabs);
  const { locale, t } = useTranslation();

  if (memberships.length <= 1) return null; // 只有 1 个也没必要显示切换器

  const onChange = async (value: string) => {
    if (value === activeOrgId) return;
    try {
      const res = await switchOrg(value);
      setAuth({
        token: res.accessToken,
        user: res.user,
        mode: res.mode,
        activeOrgId: res.activeOrgId ?? null,
        memberships: res.memberships ?? [],
        externalContext: res.externalContext ?? null,
        accountUnit: res.accountUnit ?? null,
        permissions: res.permissions ?? [],
      });
      // 硬重载前先清 tabs：避免下一次进来 tabs 里还有旧机构的路由
      clearTabs();
      window.location.reload();
    } catch {
      message.error(t('organization.switchFailed'));
    }
  };

  return (
    <Select
      prefix={<GlobalOutlined />}
      style={{ width: 200, marginRight: 16 }}
      value={activeOrgId ?? undefined}
      onChange={onChange}
      options={memberships.map((m) => ({
        value: m.organizationId,
        label: localizedOrganizationName(
          m.organizationCode,
          m.organizationName,
          locale,
        ),
      }))}
    />
  );
}
