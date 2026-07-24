'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role } from './role';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  email: string | null;
}

export interface Membership {
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  role: Role;
}

export interface ExternalContext {
  carrierId: string | null;
  carrierName?: string | null;
  customerId: string | null;
  customerName?: string | null;
}

export interface AccountUnit {
  type: 'ORG' | 'CARRIER' | 'CUSTOMER';
  id: string;
  code: string | null;
  name: string;
}

export type LoginMode = 'EXTERNAL' | 'SINGLE_ORG' | 'NEEDS_SELECTION';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  mode: LoginMode | null;
  activeOrgId: string | null;
  memberships: Membership[];
  externalContext: ExternalContext | null;
  accountUnit: AccountUnit | null;
  // 后端下发的功能权限清单；前端按钮可见性完全据此驱动，不再直接检查 role
  permissions: string[];
  hasHydrated: boolean;
  // 完整登录成功（外部账号或单机构直登）
  setAuth: (payload: {
    token: string;
    user: AuthUser;
    mode: LoginMode;
    activeOrgId: string | null;
    memberships: Membership[];
    externalContext: ExternalContext | null;
    accountUnit?: AccountUnit | null;
    permissions: string[];
  }) => void;
  // 多机构场景：先存预授权 token + 待选 memberships + 权限清单（选完机构不重拉）
  setPreAuth: (payload: {
    token: string;
    user: AuthUser;
    memberships: Membership[];
    permissions: string[];
  }) => void;
  logout: () => void;
  setHasHydrated: (value: boolean) => void;
}

// persist 从 localStorage 恢复状态是异步的：Next.js 服务端渲染时 token 必定是初始值 null，
// 客户端 hydrate 完成前如果直接用 token 判断跳转登录页，会出现"刷新页面瞬间跳回登录"的问题。
// hasHydrated 标记 rehydrate 是否完成，守卫逻辑必须等它为 true 后再判断。
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      mode: null,
      activeOrgId: null,
      memberships: [],
      externalContext: null,
      accountUnit: null,
      permissions: [],
      hasHydrated: false,
      setAuth: ({
        token,
        user,
        mode,
        activeOrgId,
        memberships,
        externalContext,
        accountUnit,
        permissions,
      }) =>
        set({
          token,
          user,
          mode,
          activeOrgId,
          memberships,
          externalContext,
          accountUnit: accountUnit ?? null,
          permissions,
        }),
      setPreAuth: ({ token, user, memberships, permissions }) =>
        set({
          token,
          user,
          mode: 'NEEDS_SELECTION',
          activeOrgId: null,
          memberships,
          externalContext: null,
          accountUnit: null,
          permissions,
        }),
      logout: () =>
        set({
          token: null,
          user: null,
          mode: null,
          activeOrgId: null,
          memberships: [],
          externalContext: null,
          accountUnit: null,
          permissions: [],
        }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'tms-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        mode: state.mode,
        activeOrgId: state.activeOrgId,
        memberships: state.memberships,
        externalContext: state.externalContext,
        accountUnit: state.accountUnit,
        permissions: state.permissions,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
