'use client';

import { Dropdown, Tabs } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/useTranslation';
import { useLayoutStore } from './layoutStore';
import { getNavIcon } from './navModel';

// 工作台 tab 条：显示已打开的页面，可切换/关闭
// 依赖 layoutStore.tabs；通过路由 pathname 变化同步"当前活动 tab"
export function WorkspaceTabs() {
  const router = useRouter();
  const { t } = useTranslation();
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabPath = useLayoutStore((s) => s.activeTabPath);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const closeOtherTabs = useLayoutStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useLayoutStore((s) => s.closeTabsToRight);
  const refreshTab = useLayoutStore((s) => s.refreshTab);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  if (tabs.length === 0) return null;

  const navigateIfNeeded = (next: string | null) => {
    if (next) {
      setActiveTab(next);
      router.push(next);
    }
  };

  return (
    <div className="workspace-tabs">
      <Tabs
        type="editable-card"
        hideAdd
        size="small"
        activeKey={activeTabPath ?? undefined}
        onChange={(k) => {
          setActiveTab(k);
          router.push(k);
        }}
        onEdit={(target, action) => {
          if (action === 'remove' && typeof target === 'string') {
            navigateIfNeeded(closeTab(target));
          }
        }}
        items={tabs.map((tab) => {
          const label = tab.i18nKey ? t(tab.i18nKey) : tab.title || tab.path;
          const hasClosableTabsOnRight = tabs
            .slice(tabs.findIndex((t) => t.path === tab.path) + 1)
            .some((t) => t.closable);
          return {
            key: tab.path,
            label: (
              <Dropdown
                trigger={['contextMenu']}
                menu={{
                  items: [
                    { key: 'refresh', label: '刷新当前页' },
                    {
                      key: 'close',
                      label: '关闭当前页',
                      disabled: !tab.closable,
                    },
                    { type: 'divider' },
                    { key: 'closeOthers', label: '关闭其他页' },
                    {
                      key: 'closeRight',
                      label: '关闭右侧页',
                      disabled: !hasClosableTabsOnRight,
                    },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'refresh') refreshTab(tab.path);
                    if (key === 'close') navigateIfNeeded(closeTab(tab.path));
                    if (key === 'closeOthers') {
                      navigateIfNeeded(closeOtherTabs(tab.path));
                    }
                    if (key === 'closeRight') {
                      navigateIfNeeded(closeTabsToRight(tab.path));
                    }
                  },
                }}
              >
                <span
                  className="workspace-tab-label"
                  onContextMenu={(event) => event.stopPropagation()}
                >
                  {getNavIcon(tab.key)}
                  <span>{label}</span>
                </span>
              </Dropdown>
            ),
            closable: tab.closable,
          };
        })}
        style={{ margin: 0 }}
      />
    </div>
  );
}
