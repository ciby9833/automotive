import { apiClient, unwrap } from './client';

export type VehicleTowType = 'CC' | 'TOWING' | 'TANSYA';

export interface OutboundVinRow {
  vin: string;
  brand?: string;
  model?: string;
  color?: string;
  vehicleType?: string;
  dealerCode?: string;
  dealerName?: string;
  towType?: VehicleTowType;
  groupCode?: string;
}

export interface ImportOutboundOrderPayload {
  customerId: string;
  originYardId: string;
  customerOrderNo?: string;
  remark?: string;
  vins: OutboundVinRow[];
}

export interface OutboundOrderListRow {
  id: string;
  orderCode: string;
  customerOrderNo: string | null;
  customerName: string;
  originYardName: string;
  organizationId: string;
  organizationName: string;
  createdAt: string;
}

export interface OutboundOrderVinDetail {
  id: string;
  vin: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  vehicleType: string | null;
  dealerCode: string | null;
  dealerName: string | null;
  towType: VehicleTowType | null;
  groupCode: string | null;
  arrivalStatus: 'EXPECTED' | 'ARRIVED' | 'CANCELLED';
  isAllocated: boolean;
  slot?: { id: string; code: string; yard?: { id: string; name: string; code: string } };
  order?: {
    id: string;
    orderCode: string;
    customerOrderNo: string | null;
    customerId?: string;
  };
}

export interface PlanWaybillPayload {
  orderVinIds: string[];
  originYardId: string;
  carrierId: string;
  driverId?: string;
  vehicleId?: string;
  towType?: VehicleTowType;
  customerWaybillCode?: string;
  recipientName?: string;
  recipientPhone?: string;
  remark?: string;
}

export const outboundApi = {
  importOrder: (payload: ImportOutboundOrderPayload) =>
    unwrap<{
      orderId: string;
      orderCode: string;
      matched: number;
      missing: string[];
      alreadyBound?: string[];
      alreadyAllocated?: string[];
    }>(apiClient.post('/outbound/orders/import', payload)),

  listOrders: (params?: {
    customerId?: string;
    customerOrderNo?: string;
    organizationId?: string;
    status?: 'ALL' | 'PENDING' | 'COMPLETED';
  }) =>
    unwrap<OutboundOrderListRow[]>(
      apiClient.get('/outbound/orders', { params }),
    ),

  orderDetail: (id: string) =>
    unwrap<{ order: unknown; vins: OutboundOrderVinDetail[] }>(
      apiClient.get(`/outbound/orders/${id}`),
    ),

  listAvailable: (params: {
    customerId?: string;
    yardId?: string;
    dealerCode?: string;
    groupCode?: string;
    outboundOrderId?: string;
  }) =>
    unwrap<OutboundOrderVinDetail[]>(
      apiClient.get('/outbound/plan/available', { params }),
    ),

  plan: (payload: PlanWaybillPayload) =>
    unwrap<{ id: string; waybillCode: string }>(
      apiClient.post('/outbound/plan', payload),
    ),
};
