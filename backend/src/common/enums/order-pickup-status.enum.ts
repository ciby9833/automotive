// 入库订单的提货生命周期（存 Order 表）
// PENDING: 已分派承运商 (pickupCarrierId 有值) 或未分派 (null 都归此)
// IN_PROGRESS: 至少一台 VIN 已被 pickupScan
// COMPLETED: 全部 VIN 已被 pickedUp / ARRIVED / CANCELLED
export enum OrderPickupStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}
