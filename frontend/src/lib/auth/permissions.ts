'use client';

import { useAuthStore } from './store';

// 与后端 src/common/enums/permission.enum.ts 保持一致
export enum Permission {
  YARD_VIEW_BOARD = 'yard:view-board',
  YARD_ASSIGN_SLOT = 'yard:assign-slot',
  YARD_RELEASE_SLOT = 'yard:release-slot',
  YARD_MOVE_VEHICLE = 'yard:move-vehicle',
  YARD_VIEW_VIN_INVENTORY = 'yard:view-vin-inventory',
  SETUP_YARD_CRUD = 'setup:yard-crud',
  SETUP_SLOT_CRUD = 'setup:slot-crud',
  SETUP_SLOT_IMPORT = 'setup:slot-import',
  SETUP_SLOT_DELETE = 'setup:slot-delete',
  ORDER_VIEW = 'order:view',
  ORDER_CREATE = 'order:create',
  WAYBILL_VIEW = 'waybill:view',
  WAYBILL_CREATE = 'waybill:create',
  WAYBILL_SCAN = 'waybill:scan',
  PARTNER_CARRIER_VIEW = 'partner:carrier-view',
  PARTNER_CARRIER_CRUD = 'partner:carrier-crud',
  PARTNER_CUSTOMER_VIEW = 'partner:customer-view',
  PARTNER_CUSTOMER_CRUD = 'partner:customer-crud',
  PARTNER_INVITE = 'partner:invite',
  FINANCE_VIEW = 'finance:view',
  FINANCE_CONFIRM = 'finance:confirm',
  FINANCE_SEND_BILL = 'finance:send-bill',
  FINANCE_CREATE = 'finance:create',
  SETUP_USER_CRUD = 'setup:user-crud',
  SETUP_USER_MEMBERSHIP = 'setup:user-membership',
  ORG_VIEW = 'org:view',
  ORG_CRUD = 'org:crud',
  TRACKING_VIEW = 'tracking:view',
  // 入库模块
  INBOUND_IMPORT = 'inbound:import',
  INBOUND_VIEW = 'inbound:view',
  INBOUND_SCAN = 'inbound:scan',
  INBOUND_BATCH_MANAGE = 'inbound:batch-manage',
  PICKUP_SCAN = 'pickup:scan',
  PICKUP_VIEW = 'pickup:view',
  // 出库模块
  OUTBOUND_IMPORT = 'outbound:import',
  OUTBOUND_VIEW = 'outbound:view',
  OUTBOUND_PLAN = 'outbound:plan',
}

// 单个权限检查
export function usePermission(permission: Permission): boolean {
  return useAuthStore((s) => s.permissions.includes(permission));
}

// 任一权限命中即返回 true
export function useAnyPermission(...permissions: Permission[]): boolean {
  return useAuthStore((s) =>
    permissions.some((p) => s.permissions.includes(p)),
  );
}
