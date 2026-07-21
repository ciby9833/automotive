import { apiClient, unwrap } from './client';

export type OrderVinArrivalStatus = 'EXPECTED' | 'ARRIVED' | 'CANCELLED';

export interface InboundVinRow {
  vin: string;
  brand?: string;
  model?: string;
  color?: string;
  vehicleType?: string;
  motorNo?: string;
}

export interface ImportInboundOrderPayload {
  customerId: string;
  destinationYardId: string;
  customerOrderNo?: string;
  originText?: string;
  expectedArrivalDate?: string;
  remark?: string;
  vins: InboundVinRow[];
}

export type InboundOrderStatus = 'ACTIVE' | 'CANCELLED';

export interface InboundOrderListRow {
  id: string;
  orderCode: string;
  customerOrderNo: string | null;
  customerName: string;
  destinationYardName: string;
  organizationId: string;
  organizationName: string;
  expectedArrivalDate: string | null;
  total: number;
  arrived: number;
  pickedUp: number;
  createdAt: string;
  status: InboundOrderStatus;
  cancelledAt: string | null;
  cancelledByUserName: string | null;
}

export interface InboundBatch {
  id: string;
  organizationId: string;
  yardId: string;
  batchCode: string;
  arrivedDate: string;
  notes: string | null;
  createdByUserId: string | null;
  yard?: { id: string; code: string; name: string };
  createdAt: string;
}

export interface InboundOrderVinDetail {
  id: string;
  vin: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  motorNo: string | null;
  arrivalStatus: OrderVinArrivalStatus;
  pickedUpAt: string | null;
  pickupLocation: string | null;
  pickupCarrier?: { id: string; name: string; shortName: string | null };
  pickupDriverUser?: { id: string; displayName: string };
  pickupPhotoUrls: string[] | null;
  pickupRemark: string | null;
  arrivedAt: string | null;
  arrivedByUser?: { id: string; displayName: string };
  slot?: { id: string; code: string; yard?: { id?: string; name: string; code: string } };
  inboundBatch?: { id: string; batchCode: string };
  arrivalPhotoUrls: string[] | null;
  vehicleCheckInfo: Record<string, string | number> | null;
  arrivalRemark: string | null;
  cancelledAt: string | null;
  cancelledByUser?: { id: string; displayName: string } | null;
  // 生命周期接口会带上 order 关联和 isAllocated；订单详情接口里同样的 shape 但可能不带 order
  order?: { id: string; orderCode: string; customerOrderNo: string | null };
  isAllocated?: boolean;
}

export interface PickupLookupResult {
  vin: InboundOrderVinDetail;
  canPickup: boolean;
  reason?: string;
}

export const inboundApi = {
  importOrder: (payload: ImportInboundOrderPayload) =>
    unwrap<{ orderId: string; orderCode: string; created: number; skipped: number }>(
      apiClient.post('/inbound/orders/import', payload),
    ),
  listOrders: (params?: {
    customerId?: string;
    destinationYardId?: string;
    customerOrderNo?: string;
    organizationId?: string;
    status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  }) => unwrap<InboundOrderListRow[]>(apiClient.get('/inbound/orders', { params })),
  orderDetail: (
    id: string,
    params?: { keyword?: string; status?: OrderVinArrivalStatus },
  ) =>
    unwrap<{
      order: unknown;
      vins: InboundOrderVinDetail[];
      totals: { total: number; arrived: number; pickedUp: number; cancelled: number };
    }>(apiClient.get(`/inbound/orders/${id}`, { params })),
  updateOrderVin: (
    orderId: string,
    vinId: string,
    patch: {
      brand?: string;
      model?: string;
      color?: string;
      vehicleType?: string;
      motorNo?: string;
      dealerCode?: string;
      dealerName?: string;
    },
  ) =>
    unwrap<InboundOrderVinDetail>(
      apiClient.patch(`/inbound/orders/${orderId}/vins/${vinId}`, patch),
    ),
  // DELETE 语义：软取消单条 VIN (保留数据 + 打审计标记，"已取消"Tab 仍可查)
  cancelOrderVin: (orderId: string, vinId: string) =>
    unwrap<{ ok: boolean }>(
      apiClient.delete(`/inbound/orders/${orderId}/vins/${vinId}`),
    ),
  // DELETE 语义：软取消 (保留订单壳，标 CANCELLED)
  cancelOrder: (orderId: string) =>
    unwrap<{ ok: boolean }>(apiClient.delete(`/inbound/orders/${orderId}`)),
  // 已取消订单重新导入 VIN (恢复 ACTIVE + 追加)
  reactivateOrder: (
    orderId: string,
    payload: ImportInboundOrderPayload,
  ) =>
    unwrap<{ orderId: string; orderCode: string; created: number; skipped: number }>(
      apiClient.post(`/inbound/orders/${orderId}/reactivate`, payload),
    ),
  pickupLookup: (vin: string) =>
    unwrap<PickupLookupResult>(apiClient.get(`/pickup/lookup/${vin}`)),
  pickupScan: (payload: {
    vin: string;
    location?: string;
    photoUrls?: string[];
    remark?: string;
  }) => unwrap<InboundOrderVinDetail>(apiClient.post('/pickup/scan', payload)),
  myPickups: () =>
    unwrap<InboundOrderVinDetail[]>(apiClient.get('/pickup/my')),
  // slotCode 与 zoneCode 二选一：slotCode 手动指定 / zoneCode 系统自动挑
  inboundScan: (payload: {
    vin: string;
    slotCode?: string;
    zoneCode?: string;
    inboundBatchId?: string;
    vehicleCheckInfo?: Record<string, string | number>;
    photoUrls?: string[];
    remark?: string;
  }) => unwrap<InboundOrderVinDetail>(apiClient.post('/inbound/scan', payload)),
  createBatch: (payload: {
    yardId: string;
    batchCode: string;
    arrivedDate: string;
    notes?: string;
  }) => unwrap<InboundBatch>(apiClient.post('/inbound/batches', payload)),
  listBatches: (yardId?: string) =>
    unwrap<InboundBatch[]>(apiClient.get('/inbound/batches', { params: { yardId } })),
};
