// 与后端 src/common/enums/role.enum.ts 保持一致，新增角色时两边同步修改
export enum Role {
  HQ_ADMIN = 'HQ_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  YARD_STAFF = 'YARD_STAFF',
  CUSTOMER = 'CUSTOMER',
  CARRIER_STAFF = 'CARRIER_STAFF',
  CARRIER_DRIVER = 'CARRIER_DRIVER',
}

export interface NavItem {
  key: string;
  i18nKey: string; // t('nav.*')
  path: string;
}

export interface NavGroup {
  key: string;
  i18nKey: string; // t('nav.group.*')
  items: NavItem[];
}

// 按 FVL 业务工作流组织，不是按数据库表分类：
//   Dashboard(总览) / 运输计划 / 场地运营 / 在途监控 / 财务结算 / 合作伙伴 / 系统管理
// 每个角色只看到与自己岗位相关的分组和条目，其它菜单一律不渲染（避免"这个按钮我能不能点"的心智负担）。
export const NAV_GROUPS_BY_ROLE: Record<Role, NavGroup[]> = {
  [Role.HQ_ADMIN]: [
    { key: 'dashboard', i18nKey: 'nav.dashboard', items: [
      { key: 'dashboard', i18nKey: 'nav.dashboard', path: '/dashboard' },
    ]},
    { key: 'inbound', i18nKey: 'nav.group.inbound', items: [
      { key: 'inbound-import', i18nKey: 'nav.inboundImport', path: '/inbound/import' },
      { key: 'inbound-orders', i18nKey: 'nav.inboundOrders', path: '/inbound/orders' },
      { key: 'inbound-scan', i18nKey: 'nav.inboundScan', path: '/inbound/scan' },
    ]},
    { key: 'outbound', i18nKey: 'nav.group.outbound', items: [
      { key: 'outbound-import', i18nKey: 'nav.outboundImport', path: '/outbound/import' },
      { key: 'outbound-orders', i18nKey: 'nav.outboundOrders', path: '/outbound/orders' },
      { key: 'outbound-plan', i18nKey: 'nav.outboundPlan', path: '/outbound/plan' },
      { key: 'outbound-departure', i18nKey: 'nav.outboundDeparture', path: '/outbound/departure' },
    ]},
    { key: 'delivery', i18nKey: 'nav.group.delivery', items: [
      { key: 'delivery-sign', i18nKey: 'nav.deliverySign', path: '/delivery/sign' },
    ]},
    { key: 'planning', i18nKey: 'nav.group.planning', items: [
      { key: 'waybills', i18nKey: 'nav.waybills', path: '/waybills' },
    ]},
    { key: 'yardOps', i18nKey: 'nav.group.yardOps', items: [
      { key: 'yard-board', i18nKey: 'nav.yardBoard', path: '/yards' },
      { key: 'yard-batch-assign', i18nKey: 'nav.yardBatchAssign', path: '/yards/batch-assign' },
      { key: 'vin-inventory', i18nKey: 'nav.vinInventory', path: '/vin-inventory' },
    ]},
    { key: 'monitoring', i18nKey: 'nav.group.monitoring', items: [
      { key: 'tracking', i18nKey: 'nav.tracking', path: '/tracking' },
    ]},
    { key: 'finance', i18nKey: 'nav.group.finance', items: [
      { key: 'finance', i18nKey: 'nav.finance', path: '/finance' },
    ]},
    { key: 'partners', i18nKey: 'nav.group.partners', items: [
      { key: 'customers', i18nKey: 'nav.customers', path: '/customers' },
      { key: 'carriers', i18nKey: 'nav.carriers', path: '/carriers' },
    ]},
    { key: 'setup', i18nKey: 'nav.group.setup', items: [
      { key: 'setup-yards', i18nKey: 'nav.setupYards', path: '/settings/yards' },
      { key: 'setup-slots', i18nKey: 'nav.setupSlots', path: '/settings/slots' },
      { key: 'users', i18nKey: 'nav.users', path: '/users' },
    ]},
  ],
  [Role.ORG_ADMIN]: [
    { key: 'dashboard', i18nKey: 'nav.dashboard', items: [
      { key: 'dashboard', i18nKey: 'nav.dashboard', path: '/dashboard' },
    ]},
    { key: 'inbound', i18nKey: 'nav.group.inbound', items: [
      { key: 'inbound-import', i18nKey: 'nav.inboundImport', path: '/inbound/import' },
      { key: 'inbound-orders', i18nKey: 'nav.inboundOrders', path: '/inbound/orders' },
      { key: 'inbound-scan', i18nKey: 'nav.inboundScan', path: '/inbound/scan' },
    ]},
    { key: 'outbound', i18nKey: 'nav.group.outbound', items: [
      { key: 'outbound-import', i18nKey: 'nav.outboundImport', path: '/outbound/import' },
      { key: 'outbound-orders', i18nKey: 'nav.outboundOrders', path: '/outbound/orders' },
      { key: 'outbound-plan', i18nKey: 'nav.outboundPlan', path: '/outbound/plan' },
      { key: 'outbound-departure', i18nKey: 'nav.outboundDeparture', path: '/outbound/departure' },
    ]},
    { key: 'planning', i18nKey: 'nav.group.planning', items: [
      { key: 'waybills', i18nKey: 'nav.waybills', path: '/waybills' },
    ]},
    { key: 'yardOps', i18nKey: 'nav.group.yardOps', items: [
      { key: 'yard-board', i18nKey: 'nav.yardBoard', path: '/yards' },
      { key: 'yard-batch-assign', i18nKey: 'nav.yardBatchAssign', path: '/yards/batch-assign' },
      { key: 'vin-inventory', i18nKey: 'nav.vinInventory', path: '/vin-inventory' },
    ]},
    { key: 'monitoring', i18nKey: 'nav.group.monitoring', items: [
      { key: 'tracking', i18nKey: 'nav.tracking', path: '/tracking' },
    ]},
    { key: 'finance', i18nKey: 'nav.group.finance', items: [
      { key: 'finance', i18nKey: 'nav.finance', path: '/finance' },
    ]},
    { key: 'partners', i18nKey: 'nav.group.partners', items: [
      { key: 'customers', i18nKey: 'nav.customers', path: '/customers' },
      { key: 'carriers', i18nKey: 'nav.carriers', path: '/carriers' },
    ]},
    { key: 'setup', i18nKey: 'nav.group.setup', items: [
      { key: 'setup-yards', i18nKey: 'nav.setupYards', path: '/settings/yards' },
      { key: 'setup-slots', i18nKey: 'nav.setupSlots', path: '/settings/slots' },
      { key: 'users', i18nKey: 'nav.users', path: '/users' },
    ]},
  ],
  // 场地业务员：入库扫描 + 出库启运是每天最高频动作
  [Role.YARD_STAFF]: [
    { key: 'inbound', i18nKey: 'nav.group.inbound', items: [
      { key: 'inbound-scan', i18nKey: 'nav.inboundScan', path: '/inbound/scan' },
      { key: 'inbound-orders', i18nKey: 'nav.inboundOrders', path: '/inbound/orders' },
    ]},
    { key: 'outbound', i18nKey: 'nav.group.outbound', items: [
      { key: 'outbound-departure', i18nKey: 'nav.outboundDeparture', path: '/outbound/departure' },
    ]},
    { key: 'yardOps', i18nKey: 'nav.group.yardOps', items: [
      { key: 'yard-board', i18nKey: 'nav.yardBoard', path: '/yards' },
      { key: 'yard-batch-assign', i18nKey: 'nav.yardBatchAssign', path: '/yards/batch-assign' },
      { key: 'vin-inventory', i18nKey: 'nav.vinInventory', path: '/vin-inventory' },
      { key: 'waybills', i18nKey: 'nav.myWaybillsForYard', path: '/waybills' },
    ]},
    { key: 'monitoring', i18nKey: 'nav.group.monitoring', items: [
      { key: 'tracking', i18nKey: 'nav.tracking', path: '/tracking' },
    ]},
  ],
  // 外部客户：关心"我下的车什么时候到、每张运单进度、我要付多少钱"
  [Role.CUSTOMER]: [
    { key: 'inbound', i18nKey: 'nav.group.inbound', items: [
      { key: 'inbound-orders', i18nKey: 'nav.myInboundOrders', path: '/inbound/orders' },
    ]},
    { key: 'outbound', i18nKey: 'nav.group.outbound', items: [
      { key: 'outbound-orders', i18nKey: 'nav.myOutboundOrders', path: '/outbound/orders' },
    ]},
    { key: 'planning', i18nKey: 'nav.group.planning', items: [
      { key: 'waybills', i18nKey: 'nav.myWaybills', path: '/waybills' },
    ]},
    { key: 'yardOps', i18nKey: 'nav.group.yardOps', items: [
      { key: 'vin-inventory', i18nKey: 'nav.myVins', path: '/vin-inventory' },
    ]},
    { key: 'monitoring', i18nKey: 'nav.group.monitoring', items: [
      { key: 'tracking', i18nKey: 'nav.tracking', path: '/tracking' },
    ]},
    { key: 'finance', i18nKey: 'nav.group.finance', items: [
      { key: 'finance', i18nKey: 'nav.financeConfirm', path: '/finance' },
    ]},
    { key: 'partners', i18nKey: 'nav.group.partners', items: [
      { key: 'profile', i18nKey: 'nav.customerProfile', path: '/customers' },
    ]},
  ],
  // 承运商业务员：分配给我的运单 + 提货 + 签收 + 司机车辆信息
  [Role.CARRIER_STAFF]: [
    { key: 'pickup', i18nKey: 'nav.group.pickup', items: [
      { key: 'pickup', i18nKey: 'nav.pickup', path: '/pickup' },
    ]},
    { key: 'delivery', i18nKey: 'nav.group.delivery', items: [
      { key: 'delivery-sign', i18nKey: 'nav.deliverySign', path: '/delivery/sign' },
    ]},
    { key: 'yardOps', i18nKey: 'nav.group.yardOps', items: [
      { key: 'waybills', i18nKey: 'nav.myWaybillsCarrier', path: '/waybills' },
    ]},
    { key: 'partners', i18nKey: 'nav.group.partners', items: [
      { key: 'carriers', i18nKey: 'nav.carrierDriverInfo', path: '/carriers' },
    ]},
  ],
  // 司机：提货扫描 + 签收扫描是每天的核心动作
  [Role.CARRIER_DRIVER]: [
    { key: 'pickup', i18nKey: 'nav.group.pickup', items: [
      { key: 'pickup', i18nKey: 'nav.pickup', path: '/pickup' },
    ]},
    { key: 'delivery', i18nKey: 'nav.group.delivery', items: [
      { key: 'delivery-sign', i18nKey: 'nav.deliverySign', path: '/delivery/sign' },
    ]},
    { key: 'yardOps', i18nKey: 'nav.group.yardOps', items: [
      { key: 'waybills', i18nKey: 'nav.myWaybillsDriver', path: '/waybills' },
    ]},
  ],
};
