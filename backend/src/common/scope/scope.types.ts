import { Role } from '../enums/role.enum';

// 权限作用域采用可辨识联合(discriminated union)，三种账号形态对应三种 scope，
// 各业务 service 一律通过 switch(scope.type) 分支写查询，避免遗漏某类账号或漏加过滤条件。

export interface OrgScope {
  type: 'ORG';
  // 当前会话选中的 org 节点
  activeOrgId: string;
  // activeOrgId 及其所有子孙节点的 id 集合，直接塞进 WHERE organization_id IN (...) 里
  orgIds: string[];
  // 该用户在 activeOrgId 节点上的 membership 角色（HQ_ADMIN | ORG_ADMIN | YARD_STAFF）
  role: Role;
  // YARD_STAFF 专属：绑定到某个具体场地
  scopeYardId: string | null;
}

export interface CarrierScope {
  type: 'CARRIER';
  carrierId: string;
  role: Role.CARRIER_STAFF | Role.CARRIER_DRIVER;
}

export interface CustomerScope {
  type: 'CUSTOMER';
  customerId: string;
  role: Role.CUSTOMER;
}

export type EffectiveScope = OrgScope | CarrierScope | CustomerScope;
