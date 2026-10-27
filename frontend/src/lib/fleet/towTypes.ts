/**
 * 拖车类型与默认载量：前端唯一来源，必须与后端 backend/src/modules/transport/transport.rules.ts 的 DEFAULT_CAPACITY 一致。
 * 车辆没填载量时按这里算；车辆维护、调度、指派、分组卡片都从这里取。
 */
export const TOW_TYPES = ["CC", "TANSYA", "DD", "TOWING"] as const;
export type TowTypeCode = (typeof TOW_TYPES)[number];

export const DEFAULT_CAPACITY: Record<TowTypeCode, number> = { CC: 6, TANSYA: 5, DD: 3, TOWING: 1 };

/** 车辆实际载量：车辆资料填了按填的，没填按类型默认 */
export function vehicleCapacity(towType: string | null | undefined, capacity: number | null | undefined) {
  if (capacity && capacity > 0) return capacity;
  return towType && towType in DEFAULT_CAPACITY ? DEFAULT_CAPACITY[towType as TowTypeCode] : null;
}
