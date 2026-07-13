'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { WorkspaceTabs } from './WorkspaceTabs';
import { useLayoutStore } from './layoutStore';
import { renderWorkspacePage } from './workspaceRegistry';
import { resolveWorkspaceTab } from './navModel';
import './appShell.css';

// AppShell 只负责搭骨架：sidebar / header / tabs / content
// 页面业务组件从 children 进来，不关心布局
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabPath = useLayoutStore((s) => s.activeTabPath);
  const clearTabs = useLayoutStore((s) => s.clearTabs);

  // 跨标签页同步：A 标签切换机构后 token 变了，B 标签监听 storage 事件同步重载
  // 顺便清 tabs 避免跨机构脏数据
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'tms-auth') {
        clearTabs();
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clearTabs]);

  // 路由 -> 工作台 tab 的同步必须在 paint 前完成，否则切换时会先露出旧页面残片。
  // 只响应 pathname 变化；tab 点击时先 setActiveTab 再 router.push，不会被旧 pathname 抢回。
  useLayoutEffect(() => {
    if (!user) return;
    const resolved = resolveWorkspaceTab(user.role, pathname);
    if (!resolved) return;

    const state = useLayoutStore.getState();
    if (!state.tabs.some((tab) => tab.path === resolved.path)) {
      state.openTab({ ...resolved, title: t(resolved.i18nKey) });
      return;
    }
    if (state.activeTabPath !== resolved.path) {
      state.setActiveTab(resolved.path);
    }
  }, [pathname, t, user]);

  if (!user) return null;

  const activePath = activeTabPath ?? pathname;

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="app-sidebar">
        <AppSidebar />
      </aside>
      <main className="app-main">
        <AppHeader />
        <WorkspaceTabs />
        <div className="app-content">
          <div className="app-content-inner">
            {tabs.map((tab) => {
              const node = renderWorkspacePage(tab);
              if (!node) return null;
              return (
                <div
                  key={`${tab.path}:${tab.version ?? 0}`}
                  className={`workspace-page ${tab.path === activePath ? 'is-active' : 'is-hidden'}`}
                >
                  {node}
                </div>
              );
            })}
            {!tabs.some((tab) => tab.path === activePath) && (
              <div className="workspace-page is-active">{children}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
