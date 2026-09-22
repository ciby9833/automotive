"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { useTranslation } from "@/i18n/useTranslation";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { useLayoutStore } from "./layoutStore";
import { renderWorkspacePage } from "./workspaceRegistry";
import { resolveWorkspaceTab, canAccessPath } from "./navModel";
import { AUTHORIZATION_CHANGED } from "@/lib/api/client";
import { getCurrentSession } from "@/lib/api/auth";
import { Alert, Button, Space, Spin } from "antd";
import "./appShell.css";

// Validate the current membership before mounting any cached business pages.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const switching = useAuthStore((s) => s.isSwitchingOrg);
  const [verified, setVerified] = useState<{
    token: string;
    contextKey: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const navigation = useAuthStore((s) => s.navigation);
  const { t } = useTranslation();
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabPath = useLayoutStore((s) => s.activeTabPath);
  const clearTabs = useLayoutStore((s) => s.clearTabs);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    const refresh = async () => {
      if (running || !token) return;
      running = true;
      const before = useAuthStore.getState();
      try {
        const me = await getCurrentSession();
        if (cancelled || token !== useAuthStore.getState().token) return;
        if (
          me.preAuth ||
          me.userId !== before.user?.id ||
          (me.activeOrgId ?? null) !== before.activeOrgId
        )
          throw new Error("Session scope mismatch");
        const contextKey = [
          me.userId,
          me.activeOrgId ?? me.accountUnit?.id,
          me.scopeYardId ?? "",
        ].join(":");
        const layout = useLayoutStore.getState();
        const grantsChanged =
          JSON.stringify([...me.permissions].sort()) !==
          JSON.stringify([...before.permissions].sort());
        if (
          grantsChanged ||
          me.role !== before.user?.role ||
          JSON.stringify(me.navigation) !== JSON.stringify(before.navigation)
        )
          clearTabs();
        layout.setContext(contextKey);
        const session = {
          permissions: me.permissions,
          navigation: me.navigation,
          memberships: me.memberships,
          accountUnit: me.accountUnit,
          user: before.user
            ? {
                ...before.user,
                role: me.role,
                displayName: me.displayName,
                email: me.email,
              }
            : null,
        };
        // Avoid persistence/storage events bouncing unchanged metadata between tabs.
        if (
          Object.entries(session).some(
            ([key, value]) =>
              JSON.stringify(value) !==
              JSON.stringify(before[key as keyof typeof session]),
          )
        )
          useAuthStore.setState(session);
        setFailed(false);
        setVerified({ token, contextKey });
      } catch {
        if (cancelled || token !== useAuthStore.getState().token) return;
        clearTabs();
        useAuthStore.setState({ permissions: [], navigation: [] });
        setVerified(null);
        setFailed(true);
      } finally {
        running = false;
      }
    };
    const onStorage = async (event: StorageEvent) => {
      if (event.key !== "tms-auth" && event.key !== null) return;
      // Same-token metadata changes are revalidated, never trusted from another tab.
      let nextToken: string | null = null;
      try {
        nextToken = event.newValue
          ? (JSON.parse(event.newValue).state?.token ?? null)
          : null;
      } catch {
        /* Invalid storage is not an authenticated session. */
      }
      if (nextToken === token) {
        void refresh();
        return;
      }
      setVerified(null);
      clearTabs();
      await useAuthStore.persist.rehydrate();
      window.location.reload();
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(AUTHORIZATION_CHANGED, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(AUTHORIZATION_CHANGED, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [token, retry, clearTabs]);

  const ready = !!token && verified?.token === token && !switching;

  // 路由 -> 工作台 tab 的同步必须在 paint 前完成，否则切换时会先露出旧页面残片。
  // 只响应 pathname 变化；tab 点击时先 setActiveTab 再 router.push，不会被旧 pathname 抢回。
  useLayoutEffect(() => {
    if (!user || !ready) return;
    if (!canAccessPath(pathname, permissions, navigation)) {
      useLayoutStore.getState().setActiveTab(pathname);
      return;
    }
    const resolved = resolveWorkspaceTab(navigation, pathname);
    if (!resolved) return;

    const state = useLayoutStore.getState();
    if (!state.tabs.some((tab) => tab.path === resolved.path)) {
      state.openTab({ ...resolved, title: t(resolved.i18nKey) });
      return;
    }
    if (state.activeTabPath !== resolved.path) {
      state.setActiveTab(resolved.path);
    }
  }, [pathname, t, user, navigation, permissions, ready]);

  if (!user) return null;
  if (!ready)
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        {failed && !switching ? (
          <Alert
            type="warning"
            showIcon
            title={t("access.sessionFailed")}
            action={
              <Space>
                <Button
                  onClick={() => {
                    setFailed(false);
                    setRetry((n) => n + 1);
                  }}
                >
                  {t("access.retrySession")}
                </Button>
                <Button
                  onClick={() => {
                    useAuthStore.getState().logout();
                    clearTabs();
                    window.location.assign("/login");
                  }}
                >
                  {t("access.signInAgain")}
                </Button>
              </Space>
            }
          />
        ) : (
          <>
            <Spin />
            <p>{t("access.sessionChecking")}</p>
          </>
        )}
      </div>
    );

  const activePath = activeTabPath ?? pathname;

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <AppSidebar />
      </aside>
      <main className="app-main">
        <AppHeader />
        <WorkspaceTabs />
        <div className="app-content">
          <div className="app-content-inner" key={verified?.contextKey}>
            {tabs.map((tab) => {
              const node = renderWorkspacePage(tab);
              if (!node || !canAccessPath(tab.path, permissions, navigation))
                return null;
              return (
                <div
                  key={`${tab.path}:${tab.version ?? 0}`}
                  className={`workspace-page ${tab.path === activePath ? "is-active" : "is-hidden"}`}
                >
                  {node}
                </div>
              );
            })}
            {!tabs.some(
              (tab) =>
                tab.path === activePath &&
                canAccessPath(tab.path, permissions, navigation),
            ) && (
              <div className="workspace-page is-active">
                {canAccessPath(activePath, permissions, navigation) ? (
                  children
                ) : (
                  <Alert
                    type="warning"
                    title="403"
                    description={t("users.permissionHint")}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
