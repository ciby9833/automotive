import type { Waybill } from '@/lib/api/waybills';
import { Permission } from '@/lib/auth/permissions';

// 分派权限判断，前端多处按钮共用同一份规则；与后端 waybills.service.assignWaybill 对齐
// - 内部：机构账号需有运单维护/执行权限，总部不能执行业务
// - 承运商：CARRIER_STAFF 且运单 carrierId 匹配
// 状态：仅 NOT_ARRIVED + 非锁定 允许
export function canAssignWaybill(
  waybill: Waybill | null | undefined,
  user: { role?: string; carrierId?: string | null; permissions: string[] },
): boolean {
  if (!waybill) return false;
  if (!user.permissions.some((p) => p === Permission.WAYBILL_CREATE || p === Permission.WAYBILL_SCAN)) return false;
  if (waybill.status !== 'NOT_ARRIVED' || waybill.isLocked) return false;
  if (user.role === 'ORG_ADMIN') return true;
  if (user.role === 'CARRIER_STAFF' && user.carrierId === waybill.carrierId) return true;
  return false;
}
