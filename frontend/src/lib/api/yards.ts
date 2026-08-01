import { apiClient, unwrap } from './client';
import type { Paginated } from './pagination';
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

// 3-level: Yard → Zone → Slot；slot 展示码是 `${zoneCode}-${line:02}-${row:02}`
export interface YardSlot {
  id: string;
  yardId: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string | null;
  zoneIsActive: boolean;
  line: number;
  row: number;
  status: 'VACANT' | 'OCCUPIED';
  currentVin: string | null;
  assignedAt: string | null;
  isLocked: boolean;
  lockedAt: string | null;
}

export interface YardZoneSummary {
  id: string;
  yardId: string;
  code: string;
  name: string | null;
  lineCount: number;
  rowCount: number;
  capacity: number;
  slotCount: number;
  occupiedCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface YardStats {
  total: number;
  occupied: number;
  vacant: number;
}

export interface VinInventoryRow {
  vin: string;
  yardId: string;
  yardCode: string;
  yardName: string;
  organizationId: string;
  slotId: string;
  slotCode: string;
  zoneCode: string;
  line: number;
  row: number;
  assignedAt: string | null;
  stayDays: number;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  orderCode: string | null;
}

export const yardsApi = {
  list: (organizationId?: string) =>
    unwrap<Yard[]>(apiClient.get('/yards', { params: { organizationId } })),
  create: (dto: { organizationId: string; code: string; name: string; address?: string }) =>
    unwrap<Yard>(apiClient.post('/yards', dto)),
  slots: (yardId: string) => unwrap<YardSlot[]>(apiClient.get(`/yards/${yardId}/slots`)),
  stats: (yardId: string) => unwrap<YardStats>(apiClient.get(`/yards/${yardId}/stats`)),

  // ============ Zone 管理 ============
  listZones: (yardId: string) =>
    unwrap<YardZoneSummary[]>(apiClient.get(`/yards/${yardId}/zones`)),
  listActiveZones: (yardId: string) =>
    unwrap<Array<{ id: string; code: string; name: string | null; lineCount: number; rowCount: number }>>(
      apiClient.get(`/yards/${yardId}/zones/active`),
    ),
  createZone: (
    yardId: string,
    dto: {
      code: string;
      name?: string | null;
      lineCount: number;
      rowCount: number;
      isActive?: boolean;
    },
  ) => unwrap<YardZoneSummary>(apiClient.post(`/yards/${yardId}/zones`, dto)),
  updateZone: (
    yardId: string,
    zoneId: string,
    dto: {
      code?: string;
      name?: string | null;
      isActive?: boolean;
      lineCount?: number;
      rowCount?: number;
    },
  ) => unwrap<YardZoneSummary>(apiClient.patch(`/yards/${yardId}/zones/${zoneId}`, dto)),
  deleteZone: (yardId: string, zoneId: string) =>
    unwrap<{ ok: true; deletedSlots: number }>(
      apiClient.delete(`/yards/${yardId}/zones/${zoneId}`),
    ),
  // 按 zone 尺寸批量生成 slot（幂等：已存在的 line/row 跳过）
  generateSlotsForZone: (
    yardId: string,
    zoneId: string,
    dto: { fromLine?: number; toLine?: number; toRow?: number } = {},
  ) =>
    unwrap<{ created: number; skipped: number }>(
      apiClient.post(`/yards/${yardId}/zones/${zoneId}/generate-slots`, dto),
    ),

  // ============ 库位运营 ============
  assignSlot: (slotId: string, vin: string) =>
    unwrap<YardSlot>(apiClient.patch(`/yards/slots/${slotId}/assign`, { vin })),
  releaseSlot: (slotId: string) =>
    unwrap<YardSlot>(apiClient.patch(`/yards/slots/${slotId}/release`)),
  moveSlot: (fromSlotId: string, toSlotId: string) =>
    unwrap<{ from: YardSlot; to: YardSlot }>(
      apiClient.post('/yards/slots/move', { fromSlotId, toSlotId }),
    ),

  // VIN 库存
  vinInventory: (params?: {
    vin?: string;
    organizationId?: string;
    yardId?: string;
    slotCode?: string;
    orderCode?: string;
    minStayDays?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    all?: boolean;
  }) => unwrap<Paginated<VinInventoryRow>>(apiClient.get('/yards/inventory/vin', { params })),
  vinLifecycle: (vin: string) =>
    unwrap<VinLifecycle>(apiClient.get(`/yards/vin/${vin}/lifecycle`)),

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
