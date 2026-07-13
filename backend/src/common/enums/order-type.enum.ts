export enum TransportType {
  TRANSFER = 'TRANSFER', // 转运：港口/外部地点 -> 场地
  REALLOCATION = 'REALLOCATION', // 调拨：场地 <-> 场地
  DELIVERY = 'DELIVERY', // 派送：场地 -> 客户/经销商
}

export enum VehicleTowType {
  CC = 'CC',
  TOWING = 'TOWING',
  TANSYA = 'TANSYA',
}
