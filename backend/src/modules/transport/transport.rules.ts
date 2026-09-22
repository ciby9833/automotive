import { BadRequestException } from '@nestjs/common';

export const TOW_TYPES = ['CC', 'TANSYA', 'TOWING'] as const;
export type TowType = (typeof TOW_TYPES)[number];

/** 业务确认的默认载量：CC 6 台、TANSYA 4 台、TOWING 1 台；单车可在主数据覆盖。 */
export const DEFAULT_CAPACITY: Record<TowType, number> = {
  CC: 6,
  TANSYA: 4,
  TOWING: 1,
};

export const LINE_OPEN_STATUSES = [
  'UNALLOCATED',
  'ALLOCATED',
  'DISPATCHED',
  'PICKED_UP',
  'IN_TRANSIT',
] as const;
export const LINE_END_STATUSES = ['DELIVERED', 'CLOSED', 'CANCELLED'] as const;

export function normalizeTransportVin(input: string): string {
  const vin = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{8,32}$/.test(vin))
    throw new BadRequestException(`VIN ${input} 格式不正确（8–32 位字母或数字）`);
  return vin;
}

/** 线下表写法不统一（tansa / Towing / car carrier），统一成枚举。 */
export function parseTowType(input: string | null | undefined): TowType | null {
  const raw = (input ?? '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (!raw) return null;
  if (raw === 'CC' || raw === 'CARCARRIER') return 'CC';
  if (raw === 'TANSA' || raw === 'TANSYA') return 'TANSYA';
  if (raw === 'TOWING' || raw === 'TOW') return 'TOWING';
  throw new BadRequestException(`拖车类型 ${input} 无法识别，应为 CC / TANSYA / TOWING`);
}

export function vehicleCapacity(
  towType: TowType,
  override: number | null | undefined,
): number {
  return override && override > 0 ? override : DEFAULT_CAPACITY[towType];
}

export interface ScanCandidate {
  id: string;
  vin: string | null;
  status: string;
  origin_id: string;
  destination_id: string;
}

export type ScanDecision =
  | { kind: 'ALREADY_PICKED'; lineId: string }
  | { kind: 'PICK'; lineId: string; bindVin: boolean }
  | { kind: 'CHOOSE'; lineIds: string[] }
  | { kind: 'UNPLANNED' };

/**
 * 提货扫码时决定这台车落到本趟次的哪一行明细：
 * 1. 明细计划 VIN 命中 → 提货；
 * 2. 指定了空 VIN 明细 → 绑定；
 * 3. 本趟空 VIN 明细只有一个（起点，终点）组合 → 自动绑定到该组合行号最小的一行；
 *    多个组合 → 让司机选站点；
 * 4. 都没有 → 计划外 VIN，交内部处理。
 */
export function decideScan(
  vin: string,
  lines: ScanCandidate[],
  chosenLineId?: string,
): ScanDecision {
  const hit = lines.find((l) => l.vin === vin);
  if (hit) {
    if (hit.status === 'DISPATCHED')
      return { kind: 'PICK', lineId: hit.id, bindVin: false };
    if (hit.status === 'PICKED_UP')
      return { kind: 'ALREADY_PICKED', lineId: hit.id };
    throw new BadRequestException(`VIN ${vin} 当前状态不能提货`);
  }
  const open = lines.filter((l) => l.status === 'DISPATCHED' && !l.vin);
  if (chosenLineId) {
    const chosen = open.find((l) => l.id === chosenLineId);
    if (!chosen)
      throw new BadRequestException('所选明细不在本趟次，或已经绑定了其他 VIN');
    return { kind: 'PICK', lineId: chosen.id, bindVin: true };
  }
  if (!open.length) return { kind: 'UNPLANNED' };
  const groups = new Map<string, string>();
  for (const l of open) {
    const key = `${l.origin_id}>${l.destination_id}`;
    if (!groups.has(key)) groups.set(key, l.id);
  }
  if (groups.size === 1)
    return { kind: 'PICK', lineId: open[0].id, bindVin: true };
  return { kind: 'CHOOSE', lineIds: [...groups.values()] };
}

/** 需求单状态由明细汇总：还有未结束的就是 OPEN；全取消为 CANCELLED；否则 COMPLETED。 */
export function deriveOrderStatus(
  statuses: string[],
): 'OPEN' | 'COMPLETED' | 'CANCELLED' {
  if (!statuses.length) return 'OPEN';
  if (statuses.some((s) => !(LINE_END_STATUSES as readonly string[]).includes(s)))
    return 'OPEN';
  return statuses.every((s) => s === 'CANCELLED') ? 'CANCELLED' : 'COMPLETED';
}

/** 趟次里所有未退出的车都签收或关闭后完成。 */
export function tripCanComplete(statuses: string[]): boolean {
  const active = statuses.filter((s) => s !== 'CANCELLED' && s !== 'ALLOCATED');
  return (
    active.length > 0 && active.every((s) => s === 'DELIVERED' || s === 'CLOSED')
  );
}

export function datesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null,
): boolean {
  const aEnd = aTo ?? '9999-12-31';
  const bEnd = bTo ?? '9999-12-31';
  return aFrom <= bEnd && bFrom <= aEnd;
}

export function transportCode(prefix: string, now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `${prefix}${d}${rand}`;
}
