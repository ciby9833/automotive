export enum Role {
  HQ_ADMIN = 'HQ_ADMIN', // 总部汽车物流管理团队，全局可见，可切换查看任意机构
  ORG_ADMIN = 'ORG_ADMIN', // 机构管理员，挂在某个机构节点(大区/国家)上，仅可见该机构下所有场地/订单/供应商/客户/财务
  YARD_STAFF = 'YARD_STAFF', // 场地业务员（场地A/场地B...）
  CUSTOMER = 'CUSTOMER', // 客户
  CARRIER_STAFF = 'CARRIER_STAFF', // 供应商业务员
  CARRIER_DRIVER = 'CARRIER_DRIVER', // 供应商司机（外部/自营车通用）
}
