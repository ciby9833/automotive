// 入库场景下 OrderVin 的到货状态机
// EXPECTED   订单导入后默认状态，等待到货
// ARRIVED    到仓入库扫描完成，绑定了具体库位
// CANCELLED  客户取消/整车损毁等异常情况
export enum OrderVinArrivalStatus {
  EXPECTED = 'EXPECTED',
  ARRIVED = 'ARRIVED',
  CANCELLED = 'CANCELLED',
}
