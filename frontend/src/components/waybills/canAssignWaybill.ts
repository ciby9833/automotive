import type { Waybill } from '@/lib/api/waybills';

// 分派权限判断，前端多处按钮共用同一份规则；与后端 waybills.service.assignWaybill 对齐
// - 内部：HQ_ADMIN / ORG_ADMIN 全通
// - 承运商：CARRIER_STAFF 且运单 carrierId 匹配
// 状态：仅 NOT_ARRIVED + 非锁定 允许
export function canAssignWaybill(
  waybill: Waybill | null | undefined,
  user: { role?: string; carrierId?: string | null },
): boolean {
  if (!waybill) return false;
  if (waybill.status !== 'NOT_ARRIVED' || waybill.isLocked) return false;
  if (user.role === 'HQ_ADMIN' || user.role === 'ORG_ADMIN') return true;
  if (user.role === 'CARRIER_STAFF' && user.carrierId === waybill.carrierId) return true;
  return false;
}
