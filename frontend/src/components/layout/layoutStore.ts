'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 工作台已打开的页面标签
export interface WorkspaceTab {
  key: string; // 稳定的路由 key(通常 = path)
  path: string;
  i18nKey: string; // 标签显示文字的 i18n key，渲染时再翻译，切换语言不 stale
  title?: string; // 兼容旧 localStorage 里已持久化的 title
  closable: boolean; // 首页(/dashboard) 不可关闭
  version?: number; // 刷新 tab 时递增，触发该页面重新挂载
  params?: Record<string, string>;
}

interface LayoutState {
  // 侧边栏折叠(只显示图标)
  sidebarCollapsed: boolean;
  // 侧边栏当前展开的分组 key 列表
  // null = 尚未初始化，[] = 用户主动全部收起
  openKeys: string[] | null;
  // 已打开的 tabs
  tabs: WorkspaceTab[];
  // 当前活动 tab 的 path
  activeTabPath: string | null;
  hasHydrated: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setOpenKeys: (keys: string[]) => void;
  openTab: (tab: WorkspaceTab) => void;
  closeTab: (path: string) => string | null; // 返回关闭后应导航到的 path(null=没有需要跳的)
  closeOtherTabs: (path: string) => string | null;
  closeTabsToRight: (path: string) => string | null;
  refreshTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  clearTabs: () => void;
  setHasHydrated: (v: boolean) => void;
}

const DEFAULT_TABS: WorkspaceTab[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    i18nKey: 'nav.dashboard',
    closable: false,
  },
];

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      openKeys: null,
      tabs: DEFAULT_TABS,
      activeTabPath: '/dashboard',
      hasHydrated: false,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setOpenKeys: (keys) => set({ openKeys: keys }),

      openTab: (tab) => {
        const tabs = get().tabs;
        if (tabs.some((t) => t.path === tab.path)) {
          set({ activeTabPath: tab.path });
          return;
        }
        set({ tabs: [...tabs, tab], activeTabPath: tab.path });
      },

      // 关闭一个 tab；若关的是当前 active，返回相邻 tab 的 path 供导航
      closeTab: (path) => {
        const tabs = get().tabs;
        const idx = tabs.findIndex((t) => t.path === path);
        if (idx < 0) return null;
        if (!tabs[idx].closable) return null; // 不可关闭

        const nextTabs = tabs.filter((t) => t.path !== path);
        const isActive = get().activeTabPath === path;
        let nextActive = get().activeTabPath;

        if (isActive) {
          // 找相邻：优先左边、其次右边、再次 dashboard
          const neighbor = tabs[idx - 1] ?? tabs[idx + 1] ?? nextTabs[0];
          nextActive = neighbor?.path ?? '/dashboard';
        }

        set({ tabs: nextTabs, activeTabPath: nextActive });
        return isActive ? nextActive : null;
      },

      closeOtherTabs: (path) => {
        const tabs = get().tabs;
        const target = tabs.find((t) => t.path === path);
        if (!target) return null;

        const nextTabs = tabs.filter((t) => !t.closable || t.path === path);
        const activeTabPath = get().activeTabPath;
        const activeStillExists = nextTabs.some((t) => t.path === activeTabPath);
        const nextActive = activeStillExists ? activeTabPath : path;

        set({ tabs: nextTabs, activeTabPath: nextActive });
        return activeStillExists ? null : nextActive;
      },

      closeTabsToRight: (path) => {
        const tabs = get().tabs;
        const idx = tabs.findIndex((t) => t.path === path);
        if (idx < 0) return null;

        const rightPaths = new Set(
          tabs.slice(idx + 1).filter((t) => t.closable).map((t) => t.path),
        );
        const nextTabs = tabs.filter((t) => !rightPaths.has(t.path));
        const activeTabPath = get().activeTabPath;
        const activeStillExists = nextTabs.some((t) => t.path === activeTabPath);
        const nextActive = activeStillExists ? activeTabPath : path;

        set({ tabs: nextTabs, activeTabPath: nextActive });
        return activeStillExists ? null : nextActive;
      },

      refreshTab: (path) =>
        set((s) => ({
          tabs: s.tabs.map((tab) =>
            tab.path === path
              ? { ...tab, version: (tab.version ?? 0) + 1 }
              : tab,
          ),
        })),

      setActiveTab: (path) => set({ activeTabPath: path }),

      // 机构切换/登出时调用，避免跨机构脏数据残留
      clearTabs: () =>
        set({ tabs: DEFAULT_TABS, activeTabPath: '/dashboard' }),

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'tms-layout',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        openKeys: s.openKeys,
        tabs: s.tabs,
        activeTabPath: s.activeTabPath,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
