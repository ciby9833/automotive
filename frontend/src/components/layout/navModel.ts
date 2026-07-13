'use client';

import { createElement, type ReactNode } from 'react';
import {
  AppstoreOutlined,
  BankOutlined,
  BarcodeOutlined,
  CarOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileSearchOutlined,
  FileSyncOutlined,
  GlobalOutlined,
  ImportOutlined,
  InboxOutlined,
  OrderedListOutlined,
  PartitionOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  ToolOutlined,
  TruckOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { NAV_GROUPS_BY_ROLE, NavGroup, NavItem, Role } from '@/lib/auth/role';
import type { WorkspaceTab } from './layoutStore';

// 供 sidebar 和 tabs 双方使用的稳定 nav 模型
// 未来接可配置角色时改这里，不动 UI 组件
export function getNavForRole(role: Role): NavGroup[] {
  return NAV_GROUPS_BY_ROLE[role] ?? [];
}

export function findExactNavItemByPath(
  role: Role,
  path: string,
): { item: NavItem; group: NavGroup } | null {
  const groups = getNavForRole(role);
  for (const group of groups) {
    const item = group.items.find((it) => it.path === path);
    if (item) return { item, group };
  }
  return null;
}

export function resolveWorkspaceTab(
  role: Role,
  path: string,
): WorkspaceTab | null {
  const exact = findExactNavItemByPath(role, path);
  if (exact) {
    return {
      key: exact.item.key,
      path: exact.item.path,
      i18nKey: exact.item.i18nKey,
      closable: exact.item.path !== '/dashboard',
    };
  }

  const inboundOrderDetail = path.match(/^\/inbound\/orders\/([^/?#]+)$/);
  if (inboundOrderDetail) {
    const canViewInboundOrders = Boolean(
      findExactNavItemByPath(role, '/inbound/orders'),
    );
    if (!canViewInboundOrders) return null;
    return {
      key: 'inbound-order-detail',
      path,
      i18nKey: 'inbound.detail.title',
      closable: true,
      params: { id: decodeURIComponent(inboundOrderDetail[1]) },
    };
  }

  const outboundOrderDetail = path.match(/^\/outbound\/orders\/([^/?#]+)$/);
  if (outboundOrderDetail) {
    const canViewOutboundOrders = Boolean(
      findExactNavItemByPath(role, '/outbound/orders'),
    );
    if (!canViewOutboundOrders) return null;
    return {
      key: 'outbound-order-detail',
      path,
      i18nKey: 'outbound.detail.title',
      closable: true,
      params: { id: decodeURIComponent(outboundOrderDetail[1]) },
    };
  }

  return null;
}

const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: createElement(DashboardOutlined),
  inbound: createElement(InboxOutlined),
  'inbound-import': createElement(ImportOutlined),
  'inbound-orders': createElement(OrderedListOutlined),
  'inbound-scan': createElement(ScanOutlined),
  outbound: createElement(TruckOutlined),
  'outbound-import': createElement(ImportOutlined),
  'outbound-orders': createElement(OrderedListOutlined),
  'outbound-plan': createElement(PartitionOutlined),
  'outbound-departure': createElement(ScanOutlined),
  delivery: createElement(CarOutlined),
  'delivery-sign': createElement(ScanOutlined),
  planning: createElement(PartitionOutlined),
  waybills: createElement(FileSearchOutlined),
  yardOps: createElement(BankOutlined),
  'yard-board': createElement(AppstoreOutlined),
  'vin-inventory': createElement(BarcodeOutlined),
  monitoring: createElement(SafetyCertificateOutlined),
  tracking: createElement(GlobalOutlined),
  finance: createElement(DollarOutlined),
  partners: createElement(TeamOutlined),
  customers: createElement(ShopOutlined),
  carriers: createElement(TruckOutlined),
  setup: createElement(SettingOutlined),
  'setup-yards': createElement(BankOutlined),
  'setup-slots': createElement(ToolOutlined),
  users: createElement(UserOutlined),
  pickup: createElement(CarOutlined),
};

export function getNavIcon(key: string): ReactNode {
  return NAV_ICONS[key] ?? createElement(AppstoreOutlined);
}
