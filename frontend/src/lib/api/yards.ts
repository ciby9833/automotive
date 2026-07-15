import { apiClient, unwrap } from './client';

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
};
