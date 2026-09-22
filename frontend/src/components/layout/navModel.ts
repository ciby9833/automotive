"use client";

import { createElement, type ReactNode } from "react";
import {
  AppstoreOutlined,
  BankOutlined,
  BarcodeOutlined,
  CarOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  ImportOutlined,
  InboxOutlined,
  MobileOutlined,
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
} from "@ant-design/icons";
import type { NavGroup, NavigationMenu } from "@/lib/auth/role";
import type { WorkspaceTab } from "./layoutStore";

// 菜单来自后端统一权限目录，不再按固定角色复制多份。
export function canAccessPath(
  path: string,
  permissions: string[],
  navigation: NavigationMenu[],
): boolean {
  const menu = [...navigation]
    .sort((a, b) => b.path.length - a.path.length)
    .find((m) => path === m.path || path.startsWith(m.path + "/"));
  return !!menu && permissions.includes(menu.permission);
}
export function getNavGroups(
  navigation: NavigationMenu[],
  permissions?: string[],
): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const m of navigation) {
    if (permissions && !permissions.includes(m.permission)) continue;
    let group = groups.find((g) => g.key === m.group);
    if (!group) {
      group = {
        key: m.group,
        i18nKey: "nav.group." + m.group,
        label: m.groupLabel,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(m);
  }
  return groups;
}
export function landingPath(
  navigation: NavigationMenu[],
  permissions: string[],
): string {
  return (
    navigation.find((m) => permissions.includes(m.permission))?.path ??
    "/dashboard"
  );
}
export function resolveWorkspaceTab(
  navigation: NavigationMenu[],
  path: string,
): WorkspaceTab | null {
  const exact = navigation.find((m) => m.path === path);
  if (exact)
    return {
      key: exact.key,
      path,
      i18nKey: exact.i18nKey,
      closable: path !== "/dashboard",
    };
  for (const kind of ["inbound", "outbound"]) {
    const match = path.match(new RegExp("^/" + kind + "/orders/([^/?#]+)$"));
    if (match && navigation.some((m) => m.path === "/" + kind + "/orders")) {
      return {
        key: kind + "-order-detail",
        path,
        i18nKey: kind + ".detail.title",
        closable: true,
        params: { id: decodeURIComponent(match[1]) },
      };
    }
  }
  return null;
}
const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: createElement(DashboardOutlined),
  inbound: createElement(InboxOutlined),
  "inbound-import": createElement(ImportOutlined),
  "inbound-orders": createElement(OrderedListOutlined),
  "inbound-scan": createElement(ScanOutlined),
  outbound: createElement(TruckOutlined),
  "outbound-import": createElement(ImportOutlined),
  "outbound-orders": createElement(OrderedListOutlined),
  "outbound-plan": createElement(PartitionOutlined),
  "outbound-departure": createElement(ScanOutlined),
  delivery: createElement(CarOutlined),
  "delivery-sign": createElement(ScanOutlined),
  planning: createElement(PartitionOutlined),
  waybills: createElement(FileSearchOutlined),
  yardOps: createElement(BankOutlined),
  "yard-board": createElement(AppstoreOutlined),
  "vin-inventory": createElement(BarcodeOutlined),
  monitoring: createElement(SafetyCertificateOutlined),
  tracking: createElement(GlobalOutlined),
  finance: createElement(DollarOutlined),
  partners: createElement(TeamOutlined),
  customers: createElement(ShopOutlined),
  carriers: createElement(TruckOutlined),
  setup: createElement(SettingOutlined),
  "setup-yards": createElement(BankOutlined),
  "setup-organizations": createElement(PartitionOutlined),
  "setup-slots": createElement(ToolOutlined),
  "app-releases": createElement(MobileOutlined),
  users: createElement(UserOutlined),
  pickup: createElement(CarOutlined),
};

export function getNavIcon(key: string): ReactNode {
  return NAV_ICONS[key] ?? createElement(AppstoreOutlined);
}
