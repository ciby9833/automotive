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
    status?: 'ALL' | 'PENDING' | 'COMPLETED';
  }) => unwrap<InboundOrderListRow[]>(apiClient.get('/inbound/orders', { params })),
  orderDetail: (id: string) =>
    unwrap<{ order: unknown; vins: InboundOrderVinDetail[] }>(
      apiClient.get(`/inbound/orders/${id}`),
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
