import { Permission as P } from '../enums/permission.enum';
import { Role as R } from '../enums/role.enum';

// 唯一权限目录。新功能登记菜单/操作/依赖，授权页和导航自动读取。
const hqOrg = [R.HQ_ADMIN, R.ORG_ADMIN];
const internal = [...hqOrg, R.YARD_STAFF];
const carriers = [R.CARRIER_STAFF, R.CARRIER_DRIVER];
const all = [...internal, ...carriers, R.CUSTOMER];
const org = [R.ORG_ADMIN];
const yardOps = [R.ORG_ADMIN, R.YARD_STAFF];
export interface ActionDefinition {
  types: R[];
  requires?: P[];
}
export const ACTIONS: Record<P, ActionDefinition> = {
  [P.SETUP_ROLE_VIEW]: { types: hqOrg },
  [P.SETUP_ROLE_MANAGE]: { types: hqOrg, requires: [P.SETUP_ROLE_VIEW] },
  [P.SETUP_USER_VIEW]: { types: hqOrg },
  [P.SETUP_USER_CRUD]: { types: hqOrg, requires: [P.SETUP_USER_VIEW] },
  [P.SETUP_USER_MEMBERSHIP]: { types: hqOrg, requires: [P.SETUP_USER_VIEW] },
  [P.ORG_VIEW]: { types: internal },
  [P.ORG_CRUD]: { types: [R.HQ_ADMIN], requires: [P.ORG_VIEW] },
  [P.YARD_VIEW_BOARD]: { types: internal },
  [P.YARD_VIEW_VIN_INVENTORY]: { types: [...internal, R.CUSTOMER] },
  [P.YARD_ASSIGN_SLOT]: {
    types: yardOps,
    requires: [P.YARD_VIEW_BOARD, P.FILE_UPLOAD],
  },
  [P.YARD_ADJUST_INVENTORY]: {
    types: yardOps,
    requires: [P.YARD_VIEW_BOARD, P.FILE_UPLOAD],
  },
  [P.YARD_RELEASE_SLOT]: { types: yardOps, requires: [P.YARD_VIEW_BOARD] },
  [P.YARD_MOVE_VEHICLE]: {
    types: yardOps,
    requires: [P.YARD_VIEW_BOARD, P.YARD_VIEW_VIN_INVENTORY],
  },
  [P.SETUP_YARD_CRUD]: {
    types: org,
    requires: [P.YARD_VIEW_BOARD, P.ORG_VIEW],
  },
  [P.SETUP_ZONE_CRUD]: {
    types: org,
    requires: [P.YARD_VIEW_BOARD, P.ORG_VIEW],
  },
  [P.ORDER_VIEW]: { types: [...hqOrg, R.CUSTOMER] },
  [P.ORDER_CREATE]: { types: org, requires: [P.ORDER_VIEW] },
  [P.WAYBILL_VIEW]: { types: all },
  [P.WAYBILL_CREATE]: {
    types: org,
    requires: [P.WAYBILL_VIEW, P.PARTNER_CARRIER_VIEW],
  },
  [P.WAYBILL_SCAN]: {
    types: [...yardOps, ...carriers],
    requires: [P.WAYBILL_VIEW, P.FILE_UPLOAD],
  },
  [P.PARTNER_CARRIER_VIEW]: { types: [...hqOrg, R.CARRIER_STAFF] },
  [P.PARTNER_CARRIER_CRUD]: {
    types: [...org, R.CARRIER_STAFF],
    requires: [P.PARTNER_CARRIER_VIEW],
  },
  [P.PARTNER_CUSTOMER_VIEW]: { types: [...hqOrg, R.CUSTOMER] },
  [P.PARTNER_CUSTOMER_CRUD]: {
    types: org,
    requires: [P.PARTNER_CUSTOMER_VIEW],
  },
  [P.PARTNER_INVITE]: { types: org },
  [P.CARRIER_USER_VIEW]: { types: [...hqOrg, R.CARRIER_STAFF] },
  [P.CARRIER_USER_MANAGE]: {
    types: [...hqOrg, R.CARRIER_STAFF],
    requires: [P.CARRIER_USER_VIEW],
  },
  [P.FINANCE_VIEW]: { types: [...hqOrg, R.CUSTOMER] },
  [P.FINANCE_CONFIRM]: {
    types: [...org, R.CUSTOMER],
    requires: [P.FINANCE_VIEW],
  },
  [P.FINANCE_SEND_BILL]: { types: org, requires: [P.FINANCE_VIEW] },
  [P.FINANCE_CREATE]: {
    types: org,
    requires: [P.FINANCE_VIEW, P.PARTNER_CARRIER_VIEW, P.PARTNER_CUSTOMER_VIEW],
  },
  [P.TRACKING_VIEW]: { types: all },
  [P.INBOUND_VIEW]: {
    types: [...internal, R.CUSTOMER],
    requires: [P.PICKUP_VIEW],
  },
  [P.INBOUND_IMPORT]: {
    types: org,
    requires: [
      P.INBOUND_VIEW,
      P.YARD_VIEW_BOARD,
      P.PARTNER_CUSTOMER_VIEW,
      P.PARTNER_CARRIER_VIEW,
    ],
  },
  [P.INBOUND_SCAN]: {
    types: yardOps,
    requires: [P.INBOUND_VIEW, P.YARD_VIEW_BOARD, P.FILE_UPLOAD],
  },
  [P.INBOUND_BATCH_MANAGE]: {
    types: yardOps,
    requires: [P.INBOUND_VIEW, P.YARD_VIEW_BOARD],
  },
  [P.PICKUP_VIEW]: { types: all },
  [P.PICKUP_SCAN]: {
    types: carriers,
    requires: [P.PICKUP_VIEW, P.FILE_UPLOAD],
  },
  [P.OUTBOUND_VIEW]: { types: [...internal, R.CUSTOMER] },
  [P.OUTBOUND_IMPORT]: {
    types: org,
    requires: [P.OUTBOUND_VIEW, P.YARD_VIEW_BOARD, P.PARTNER_CUSTOMER_VIEW],
  },
  [P.OUTBOUND_PLAN]: {
    types: org,
    requires: [
      P.OUTBOUND_VIEW,
      P.YARD_VIEW_BOARD,
      P.PARTNER_CARRIER_VIEW,
      P.PARTNER_CUSTOMER_VIEW,
    ],
  },
  [P.TRANSPORT_VIEW]: { types: [...hqOrg, ...carriers, R.CUSTOMER] },
  [P.TRANSPORT_ORDER_MANAGE]: {
    types: org,
    requires: [P.TRANSPORT_VIEW, P.PARTNER_CUSTOMER_VIEW],
  },
  [P.TRANSPORT_DISPATCH]: {
    types: [...org, R.CARRIER_STAFF],
    requires: [P.TRANSPORT_VIEW, P.PARTNER_CARRIER_VIEW],
  },
  [P.TRANSPORT_EXECUTE]: {
    types: [...org, ...carriers],
    requires: [P.TRANSPORT_VIEW, P.FILE_UPLOAD],
  },
  [P.TRANSPORT_FINANCE_VIEW]: {
    types: hqOrg,
    requires: [
      P.TRANSPORT_VIEW,
      P.PARTNER_CUSTOMER_VIEW,
      P.PARTNER_CARRIER_VIEW,
    ],
  },
  [P.TRANSPORT_FINANCE]: { types: org, requires: [P.TRANSPORT_FINANCE_VIEW] },
  [P.APP_RELEASE_VIEW]: { types: [R.HQ_ADMIN] },
  [P.APP_RELEASE_MANAGE]: {
    types: [R.HQ_ADMIN],
    requires: [P.APP_RELEASE_VIEW],
  },
  [P.SNAPSHOT_MANAGE]: { types: [R.HQ_ADMIN], requires: [P.YARD_VIEW_BOARD] },
  [P.FILE_UPLOAD]: { types: [...yardOps, ...carriers] },
};

export interface MenuDefinition {
  key: string;
  permission: string;
  path: string;
  group: string;
  groupLabel: string;
  label: string;
  i18nKey: string;
  types: R[];
  read: P[];
  actions: P[];
}
function menu(
  key: string,
  path: string,
  group: string,
  groupLabel: string,
  label: string,
  i18nKey: string,
  types: R[],
  read: P[],
  actions: P[] = [],
): MenuDefinition {
  return {
    key,
    permission: `menu:${key}`,
    path,
    group,
    groupLabel,
    label,
    i18nKey,
    types,
    read: [
      ...new Set([
        ...read,
        ...(types.some((t) => internal.includes(t)) ? [P.ORG_VIEW] : []),
      ]),
    ],
    actions,
  };
}
export const MENUS: MenuDefinition[] = [
  menu(
    'dashboard',
    '/dashboard',
    'dashboard',
    '总览',
    '总览',
    'nav.dashboard',
    internal,
    [P.YARD_VIEW_BOARD, P.ORG_VIEW],
    [P.SNAPSHOT_MANAGE],
  ),
  menu(
    'transport',
    '/transport',
    'transport',
    '纯运输',
    '纯运输',
    'nav.transport',
    [R.HQ_ADMIN, R.ORG_ADMIN, ...carriers, R.CUSTOMER],
    [P.TRANSPORT_VIEW, P.PARTNER_CUSTOMER_VIEW, P.PARTNER_CARRIER_VIEW],
    [P.TRANSPORT_ORDER_MANAGE, P.TRANSPORT_DISPATCH, P.TRANSPORT_EXECUTE],
  ),
  menu(
    'inbound-import',
    '/inbound/import',
    'inbound',
    '入库管理',
    '入库导入',
    'nav.inboundImport',
    org,
    [
      P.INBOUND_VIEW,
      P.YARD_VIEW_BOARD,
      P.PARTNER_CUSTOMER_VIEW,
      P.PARTNER_CARRIER_VIEW,
    ],
    [P.INBOUND_IMPORT],
  ),
  menu(
    'inbound-orders',
    '/inbound/orders',
    'inbound',
    '入库管理',
    '入库订单',
    'nav.inboundOrders',
    [...internal, R.CUSTOMER],
    [P.INBOUND_VIEW],
    [P.INBOUND_IMPORT, P.INBOUND_BATCH_MANAGE],
  ),
  menu(
    'inbound-scan',
    '/inbound/scan',
    'inbound',
    '入库管理',
    '入库扫描',
    'nav.inboundScan',
    yardOps,
    [P.INBOUND_VIEW, P.YARD_VIEW_BOARD],
    [P.INBOUND_SCAN, P.INBOUND_BATCH_MANAGE],
  ),
  menu(
    'pickup',
    '/pickup',
    'pickup',
    '提货管理',
    '提货任务',
    'nav.pickup',
    carriers,
    [P.PICKUP_VIEW],
    [P.PICKUP_SCAN],
  ),
  menu(
    'outbound-import',
    '/outbound/import',
    'outbound',
    '出库管理',
    '出库导入',
    'nav.outboundImport',
    org,
    [P.OUTBOUND_VIEW, P.YARD_VIEW_BOARD, P.PARTNER_CUSTOMER_VIEW],
    [P.OUTBOUND_IMPORT],
  ),
  menu(
    'outbound-orders',
    '/outbound/orders',
    'outbound',
    '出库管理',
    '出库订单',
    'nav.outboundOrders',
    [...internal, R.CUSTOMER],
    [P.OUTBOUND_VIEW],
    [P.OUTBOUND_IMPORT],
  ),
  menu(
    'outbound-plan',
    '/outbound/plan',
    'outbound',
    '出库管理',
    '出库开单',
    'nav.outboundPlan',
    hqOrg,
    [
      P.OUTBOUND_VIEW,
      P.YARD_VIEW_BOARD,
      P.PARTNER_CARRIER_VIEW,
      P.PARTNER_CUSTOMER_VIEW,
    ],
    [P.OUTBOUND_PLAN],
  ),
  menu(
    'outbound-departure',
    '/outbound/departure',
    'outbound',
    '出库管理',
    '出库启运',
    'nav.outboundDeparture',
    yardOps,
    [P.WAYBILL_VIEW, P.YARD_VIEW_BOARD],
    [P.WAYBILL_SCAN],
  ),
  menu(
    'delivery-sign',
    '/delivery/sign',
    'delivery',
    '交付管理',
    '签收扫描',
    'nav.deliverySign',
    [...org, ...carriers],
    [P.WAYBILL_VIEW],
    [P.WAYBILL_SCAN],
  ),
  menu(
    'waybills',
    '/waybills',
    'planning',
    '运单管理',
    '运单管理',
    'nav.waybills',
    all,
    [P.WAYBILL_VIEW, P.YARD_VIEW_BOARD, P.PARTNER_CARRIER_VIEW],
    [P.WAYBILL_CREATE, P.WAYBILL_SCAN],
  ),
  menu(
    'yard-board',
    '/yards',
    'yardOps',
    '场地运营',
    '场地看板',
    'nav.yardBoard',
    internal,
    [P.YARD_VIEW_BOARD],
    [
      P.YARD_ASSIGN_SLOT,
      P.YARD_RELEASE_SLOT,
      P.YARD_MOVE_VEHICLE,
      P.YARD_ADJUST_INVENTORY,
    ],
  ),
  menu(
    'yard-batch-assign',
    '/yards/batch-assign',
    'yardOps',
    '场地运营',
    '库位批量分配',
    'nav.yardBatchAssign',
    yardOps,
    [P.YARD_VIEW_BOARD, P.YARD_VIEW_VIN_INVENTORY],
    [P.YARD_MOVE_VEHICLE],
  ),
  menu(
    'vin-inventory',
    '/vin-inventory',
    'yardOps',
    '场地运营',
    'VIN 库存',
    'nav.vinInventory',
    [...internal, R.CUSTOMER],
    [P.YARD_VIEW_VIN_INVENTORY],
  ),
  menu(
    'tracking',
    '/tracking',
    'monitoring',
    '轨迹跟踪',
    '轨迹跟踪',
    'nav.tracking',
    all,
    [P.TRACKING_VIEW],
  ),
  menu(
    'finance',
    '/finance',
    'finance',
    '财务结算',
    '财务管理',
    'nav.finance',
    [...hqOrg, R.CUSTOMER],
    [P.FINANCE_VIEW, P.PARTNER_CUSTOMER_VIEW],
    [P.FINANCE_CREATE, P.FINANCE_CONFIRM, P.FINANCE_SEND_BILL],
  ),
  menu(
    'transport-finance',
    '/finance/transport',
    'finance',
    '财务结算',
    '运输财务',
    'nav.transportFinance',
    hqOrg,
    [P.TRANSPORT_FINANCE_VIEW],
    [P.TRANSPORT_FINANCE],
  ),
  menu(
    'customers',
    '/customers',
    'partners',
    '合作伙伴',
    '客户管理',
    'nav.customers',
    [...hqOrg, R.CUSTOMER],
    [P.PARTNER_CUSTOMER_VIEW],
    [P.PARTNER_CUSTOMER_CRUD, P.PARTNER_INVITE],
  ),
  menu(
    'carriers',
    '/carriers',
    'partners',
    '合作伙伴',
    '供应商管理',
    'nav.carriers',
    [...hqOrg, R.CARRIER_STAFF],
    [P.PARTNER_CARRIER_VIEW],
    [
      P.PARTNER_CARRIER_CRUD,
      P.CARRIER_USER_VIEW,
      P.CARRIER_USER_MANAGE,
      P.PARTNER_INVITE,
    ],
  ),
  menu(
    'my-carrier-users',
    '/my-carrier/users',
    'setup',
    '系统管理',
    '承运商账号',
    'nav.myCarrierUsers',
    [R.CARRIER_STAFF],
    [P.CARRIER_USER_VIEW],
    [P.CARRIER_USER_MANAGE],
  ),
  menu(
    'my-carrier-fleet',
    '/my-carrier/fleet',
    'setup',
    '系统管理',
    '承运商车队',
    'nav.myCarrierFleet',
    [R.CARRIER_STAFF],
    [P.PARTNER_CARRIER_VIEW],
    [P.PARTNER_CARRIER_CRUD],
  ),
  menu(
    'setup-organizations',
    '/settings/organizations',
    'setup',
    '系统管理',
    '机构管理',
    'orgManagement.title',
    [R.HQ_ADMIN],
    [P.ORG_VIEW],
    [P.ORG_CRUD],
  ),
  menu(
    'setup-yards',
    '/settings/yards',
    'setup',
    '系统管理',
    '场地配置',
    'nav.setupYards',
    hqOrg,
    [P.YARD_VIEW_BOARD, P.ORG_VIEW],
    [P.SETUP_YARD_CRUD],
  ),
  menu(
    'setup-slots',
    '/settings/slots',
    'setup',
    '系统管理',
    '库位配置',
    'nav.setupSlots',
    hqOrg,
    [P.YARD_VIEW_BOARD, P.ORG_VIEW],
    [P.SETUP_ZONE_CRUD],
  ),
  menu(
    'users',
    '/users',
    'setup',
    '系统管理',
    '用户管理',
    'nav.users',
    hqOrg,
    [P.SETUP_USER_VIEW, P.ORG_VIEW],
    [P.SETUP_USER_CRUD, P.SETUP_USER_MEMBERSHIP],
  ),
  menu(
    'roles',
    '/settings/roles',
    'setup',
    '系统管理',
    '角色管理',
    'access.rolesTitle',
    hqOrg,
    [P.SETUP_ROLE_VIEW, P.ORG_VIEW],
    [P.SETUP_ROLE_MANAGE],
  ),
  menu(
    'app-releases',
    '/settings/app-releases',
    'setup',
    '系统管理',
    'App 发布',
    'nav.appReleases',
    [R.HQ_ADMIN],
    [P.APP_RELEASE_VIEW],
    [P.APP_RELEASE_MANAGE],
  ),
];

export function allowedPermissions(type: R): string[] {
  return [
    ...Object.entries(ACTIONS)
      .filter(([, a]) => a.types.includes(type))
      .map(([p]) => p),
    ...MENUS.filter((m) => m.types.includes(type)).map((m) => m.permission),
  ];
}

// 依赖只增加必要 API 访问，不增加菜单入口或其他写操作。
export function expandPermissions(explicit: string[]): string[] {
  const result = new Set(explicit);
  const add = (code: string) => {
    for (const dependency of ACTIONS[code as P]?.requires ?? []) {
      if (!result.has(dependency)) {
        result.add(dependency);
        add(dependency);
      }
    }
  };
  for (const m of MENUS)
    if (result.has(m.permission)) for (const p of m.read) result.add(p);
  for (const p of [...result]) add(p);
  return [...result];
}

export function effectivePermissions(type: R, explicit: string[]): string[] {
  const allowed = new Set(allowedPermissions(type));
  return expandPermissions(explicit.filter((p) => allowed.has(p))).filter((p) =>
    allowed.has(p),
  );
}

export function defaultRolePermissions(type: R): string[] {
  return [
    ...new Set(
      MENUS.filter((m) => m.types.includes(type)).flatMap((m) => [
        m.permission,
        ...m.actions.filter((p) => ACTIONS[p].types.includes(type)),
      ]),
    ),
  ];
}
export function defaultPermissions(type: R): string[] {
  return effectivePermissions(type, defaultRolePermissions(type));
}
