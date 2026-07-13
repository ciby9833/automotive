export enum WaybillStatus {
  NOT_ARRIVED = 'NOT_ARRIVED', // 未到达
  IN_TRANSIT = 'IN_TRANSIT', // 运输中
  ARRIVED = 'ARRIVED', // 已到达（到达后锁定，不可编辑）
}

export enum ScanAction {
  INBOUND_ARRIVAL = 'INBOUND_ARRIVAL', // 到达（转运/入库）
  REALLOCATION_DEPARTURE = 'REALLOCATION_DEPARTURE', // 调拨启运
  REALLOCATION_ARRIVAL = 'REALLOCATION_ARRIVAL', // 调拨到达
  DELIVERY_DEPARTURE = 'DELIVERY_DEPARTURE', // 启运（派送）
  SIGNED = 'SIGNED', // 签收
}

export enum FinanceRecordType {
  REVENUE = 'REVENUE', // 客户收入
  COST = 'COST', // 供应商成本
  TRAVEL_EXPENSE = 'TRAVEL_EXPENSE', // 自营车差旅费
}

export enum FinanceStatus {
  PENDING = 'PENDING', // 待确认
  CONFIRMED = 'CONFIRMED', // 已确认
  SUBMITTED_OA = 'SUBMITTED_OA', // 已提交OA
}
