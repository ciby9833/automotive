'use client';

import { useMemo } from 'react';
import { Menu } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { useLayoutStore } from './layoutStore';
import { getNavForRole, getNavIcon } from './navModel';

// 左侧菜单：不管布局、不管 tabs、不管滚动
// 点击菜单 → openTab(via layoutStore) + router.push
export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const openKeys = useLayoutStore((s) => s.openKeys);
  const setOpenKeys = useLayoutStore((s) => s.setOpenKeys);
  const openTab = useLayoutStore((s) => s.openTab);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const activeTabPath = useLayoutStore((s) => s.activeTabPath);

  const navGroups = useMemo(
    () => (user ? getNavForRole(user.role) : []),
    [user],
  );

  const selectedKey = useMemo(() => {
    const activePath = activeTabPath ?? pathname;
    let best: { key: string; len: number } | null = null;
    for (const g of navGroups) {
      for (const item of g.items) {
        if (activePath === item.path || activePath.startsWith(item.path + '/')) {
          if (!best || item.path.length > best.len) {
            best = { key: item.key, len: item.path.length };
          }
        }
      }
    }
    return best?.key ?? '';
  }, [activeTabPath, navGroups, pathname]);

  // 首次进来时，把带子菜单的分组默认全部展开
  const defaultOpenKeys = useMemo(() => {
    if (openKeys !== null) return openKeys;
    return navGroups.filter((g) => g.items.length > 1).map((g) => g.key);
  }, [navGroups, openKeys]);

  if (!user) return null;

  const menuItems = navGroups.map((g) => {
    if (g.items.length === 1) {
      const only = g.items[0];
      return {
        key: only.key,
        icon: getNavIcon(only.key),
        label: t(only.i18nKey),
      };
    }
    return {
      key: g.key,
      icon: getNavIcon(g.key),
      label: t(g.i18nKey),
      children: g.items.map((it) => ({
        key: it.key,
        icon: getNavIcon(it.key),
        label: t(it.i18nKey),
      })),
    };
  });

  const onClick = ({ key }: { key: string }) => {
    for (const g of navGroups) {
      const item = g.items.find((it) => it.key === key);
      if (!item) continue;
      const title = t(item.i18nKey);
      openTab({
        key: item.key,
        path: item.path,
        i18nKey: item.i18nKey,
        title,
        closable: item.path !== '/dashboard',
      });
      setActiveTab(item.path);
      router.push(item.path);
      return;
    }
  };

  return (
    <div className="app-sidebar-inner">
      <div className="app-sidebar-brand">
        <span className="brand-text">
          {collapsed ? 'TMS' : t('app.title')}
        </span>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={[selectedKey]}
        openKeys={collapsed ? [] : defaultOpenKeys}
        onOpenChange={setOpenKeys}
        items={menuItems}
        onClick={onClick}
        style={{ borderRight: 0, background: 'transparent' }}
      />
    </div>
  );
}
