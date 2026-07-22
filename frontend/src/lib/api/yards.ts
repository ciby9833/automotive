import { apiClient, unwrap } from './client';
import type { InboundOrderVinDetail } from './inbound';
import type { Waybill } from './waybills';

// VIN 全生命周期返回结构：给场地看板抽屉一次拉完整
export interface VinLifecycle {
  vin: string;
  orderVin: InboundOrderVinDetail | null;
  waybills: Waybill[];
  events: Array<{
    id: string;
    createdAt: string;
    action: string;
    vin: string;
    remark: string | null;
    attachmentUrls: string[] | null;
    vehicleCheckInfo: Record<string, unknown> | null;
    yard?: { id: string; code: string; name: string } | null;
    operator?: { id: string; displayName: string } | null;
    waybill?: { id: string; waybillCode: string } | null;
  }>;
}

export interface Yard {
  id: string;
  organizationId: string;
  organization?: { id: string; code: string; name: string };
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

export interface YardSlot {
  id: string;
  yardId: string;
  code: string;
  row: string | null;
  slotNo: string | null;
  status: 'VACANT' | 'OCCUPIED';
  currentVin: string | null;
  assignedAt: string | null;
  isLocked: boolean;
}

export interface YardStats {
  total: number;
  occupied: number;
  vacant: number;
}

// VIN 库存单行：从 slot 反查所在场地+订单信息
export interface VinInventoryRow {
  vin: string;
  yardId: string;
  yardCode: string;
  yardName: string;
  organizationId: string;
  slotId: string;
  slotCode: string;
  assignedAt: string | null;
  stayDays: number;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  orderCode: string | null;
}

export interface SlotDto {
  code: string;
  row?: string;
  slotNo?: string;
}

export const yardsApi = {
  list: (organizationId?: string) =>
    unwrap<Yard[]>(apiClient.get('/yards', { params: { organizationId } })),
  create: (dto: { organizationId: string; code: string; name: string; address?: string }) =>
    unwrap<Yard>(apiClient.post('/yards', dto)),
  slots: (yardId: string) => unwrap<YardSlot[]>(apiClient.get(`/yards/${yardId}/slots`)),
  stats: (yardId: string) => unwrap<YardStats>(apiClient.get(`/yards/${yardId}/stats`)),
  createSlot: (yardId: string, dto: SlotDto) =>
    unwrap<YardSlot>(apiClient.post(`/yards/${yardId}/slots`, dto)),
  // 批量创建：Excel 导入/生成器；返回 { created, skipped }
  bulkCreateSlots: (yardId: string, slots: SlotDto[]) =>
    unwrap<{ created: number; skipped: number }>(
      apiClient.post(`/yards/${yardId}/slots/bulk`, { slots }),
    ),
  bulkDeleteSlots: (yardId: string, slotIds: string[]) =>
    unwrap<{ deleted: number; blocked: number }>(
      apiClient.delete(`/yards/${yardId}/slots`, { data: { slotIds } }),
    ),
  assignSlot: (slotId: string, vin: string) =>
    unwrap<YardSlot>(apiClient.patch(`/yards/slots/${slotId}/assign`, { vin })),
  releaseSlot: (slotId: string) =>
    unwrap<YardSlot>(apiClient.patch(`/yards/slots/${slotId}/release`)),
  // 场内移位：一步完成源→目标
  moveSlot: (fromSlotId: string, toSlotId: string) =>
    unwrap<{ from: YardSlot; to: YardSlot }>(
      apiClient.post('/yards/slots/move', { fromSlotId, toSlotId }),
    ),
  // VIN 库存主视图
  vinInventory: (params?: {
    vin?: string;
    organizationId?: string;
    yardId?: string;
    minStayDays?: number;
  }) => unwrap<VinInventoryRow[]>(apiClient.get('/yards/inventory/vin', { params })),
  // VIN 全生命周期：orderVin + 出库运单 + 事件流水
  vinLifecycle: (vin: string) =>
    unwrap<VinLifecycle>(apiClient.get(`/yards/vin/${vin}/lifecycle`)),
  // 批量分配库位 (初始化 / 大规模移位)
  batchAssignSlots: (payload: {
    yardId: string;
    items: Array<{ vin: string; slotCode: string }>;
    remark?: string;
  }) =>
    unwrap<{
      total: number;
      succeeded: number;
      skipped: Array<{ vin: string; reason: string }>;
      failed: Array<{ vin: string; slotCode: string; reason: string }>;
    }>(apiClient.post('/yards/slots/batch-assign', payload)),
};
