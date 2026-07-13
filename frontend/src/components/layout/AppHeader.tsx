'use client';

import { Avatar, Button, Dropdown, Typography } from 'antd';
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { Role } from '@/lib/auth/role';
import { useTranslation } from '@/i18n/useTranslation';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLayoutStore } from './layoutStore';

const INTERNAL_ROLES = new Set([
  Role.HQ_ADMIN,
  Role.ORG_ADMIN,
  Role.YARD_STAFF,
]);

export function AppHeader() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearTabs = useLayoutStore((s) => s.clearTabs);
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const { t } = useTranslation();

  if (!user) return null;
  const isInternal = INTERNAL_ROLES.has(user.role);

  return (
    <div className="app-header">
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={toggleSidebar}
        style={{ fontSize: 16, width: 40, height: 40 }}
        aria-label="collapse"
      />
      <div className="app-header-spacer" />
      {isInternal && <OrganizationSwitcher />}
      <LanguageSwitcher />
      <Dropdown
        menu={{
          items: [{ key: 'logout', label: t('auth.logout'), icon: <LogoutOutlined /> }],
          onClick: () => {
            logout();
            clearTabs(); // 登出清空 tabs，避免下次登录残留
            router.replace('/login');
          },
        }}
      >
        <span className="app-header-user">
          <Avatar icon={<UserOutlined />} style={{ marginRight: 8 }} />
          <span className="header-user-name">{user.displayName}</span>
          <Typography.Text
            type="secondary"
            className="header-user-role"
            style={{ marginLeft: 8 }}
          >
            {t(`roles.${user.role}`)}
          </Typography.Text>
        </span>
      </Dropdown>
    </div>
  );
}
