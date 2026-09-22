// 固定账号数据范围类型，与可维护的机构业务角色分开。
export enum Role {
  HQ_ADMIN = "HQ_ADMIN", ORG_ADMIN = "ORG_ADMIN", YARD_STAFF = "YARD_STAFF",
  CUSTOMER = "CUSTOMER", CARRIER_STAFF = "CARRIER_STAFF", CARRIER_DRIVER = "CARRIER_DRIVER",
}
export interface NavItem { key: string; i18nKey: string; path: string; label?: string }
export interface NavGroup { key: string; i18nKey: string; items: NavItem[]; label?: string }
export interface NavigationMenu extends NavItem {
  permission: string; group: string; groupLabel: string;
}
