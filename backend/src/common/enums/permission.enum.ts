// 功能权限枚举：细化到"能做哪个动作"，比 Role 粒度更细
// 角色→权限 映射在 role-permissions.ts；接口用 @Permissions(X) 声明所需权限
export enum Permission {
  // 场地看板 (日常运营，YARD_STAFF 每天用)
  YARD_VIEW_BOARD = 'yard:view-board',
  YARD_ASSIGN_SLOT = 'yard:assign-slot',
  YARD_RELEASE_SLOT = 'yard:release-slot',
  YARD_MOVE_VEHICLE = 'yard:move-vehicle',
  YARD_VIEW_VIN_INVENTORY = 'yard:view-vin-inventory',

  // 场地/库位 配置 (系统管理，仅 ORG_ADMIN+)
  SETUP_YARD_CRUD = 'setup:yard-crud',
  SETUP_SLOT_CRUD = 'setup:slot-crud',
  SETUP_SLOT_IMPORT = 'setup:slot-import',
  SETUP_SLOT_DELETE = 'setup:slot-delete',

  // 运输计划
  ORDER_VIEW = 'order:view',
  ORDER_CREATE = 'order:create',
  WAYBILL_VIEW = 'waybill:view',
  WAYBILL_CREATE = 'waybill:create',
  WAYBILL_SCAN = 'waybill:scan',

  // 合作伙伴
  PARTNER_CARRIER_VIEW = 'partner:carrier-view',
  PARTNER_CARRIER_CRUD = 'partner:carrier-crud',
  PARTNER_CUSTOMER_VIEW = 'partner:customer-view',
  PARTNER_CUSTOMER_CRUD = 'partner:customer-crud',
  PARTNER_INVITE = 'partner:invite',

  // 承运商账号管理 (承运商侧司机/业务员账号)
  //   VIEW: 查看某承运商下的账号列表
  //   MANAGE: 创建/编辑/禁用/启用/重置密码
  // HQ/ORG_ADMIN 拥有全场景 (受 carrier.organizationId 归属校验)；CARRIER_STAFF 仅自家
  CARRIER_USER_VIEW = 'carrier:user-view',
  CARRIER_USER_MANAGE = 'carrier:user-manage',

  // 财务结算
  FINANCE_VIEW = 'finance:view',
  FINANCE_CONFIRM = 'finance:confirm',
  FINANCE_SEND_BILL = 'finance:send-bill',
  FINANCE_CREATE = 'finance:create',

  // 系统管理 > 用户
  SETUP_USER_CRUD = 'setup:user-crud',
  SETUP_USER_MEMBERSHIP = 'setup:user-membership',

  // 组织
  ORG_VIEW = 'org:view',
  ORG_CRUD = 'org:crud',

  // 轨迹
  TRACKING_VIEW = 'tracking:view',

  // 入库模块
  INBOUND_IMPORT = 'inbound:import', // 极兔操作员导入 BYD Excel
  INBOUND_VIEW = 'inbound:view', // 查看入库订单列表/详情
  INBOUND_SCAN = 'inbound:scan', // 场地业务员到仓入库扫码
  INBOUND_BATCH_MANAGE = 'inbound:batch-manage', // 建/改批次
  PICKUP_SCAN = 'pickup:scan', // 供应商司机在港口扫码
  PICKUP_VIEW = 'pickup:view', // 查看提货记录

  // 出库模块
  OUTBOUND_IMPORT = 'outbound:import', // 客户 Excel 导入出库订单
  OUTBOUND_VIEW = 'outbound:view', // 查看出库订单
  OUTBOUND_PLAN = 'outbound:plan', // 开单：选 VIN + 分配供应商/司机 → 生成 Waybill
}
