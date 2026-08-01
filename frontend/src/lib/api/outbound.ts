import { apiClient, unwrap } from './client';
import type { Paginated } from './pagination';

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

// 始发仓不再作为导入必填：VIN 各自的当前所在库位就是权威始发仓
export interface ImportOutboundOrderPayload {
  customerId: string;
  customerOrderNo?: string;
  remark?: string;
  vins: OutboundVinRow[];
}

export interface OutboundOriginYard {
  yardId: string | null; // null = 未到仓桶
  yardName: string;
  yardCode: string | null;
  vinCount: number;
}

export type OutboundOrderStatus = 'ACTIVE' | 'CANCELLED';

export interface OutboundOrderListRow {
  id: string;
  orderCode: string;
  customerOrderNo: string | null;
  customerName: string;
  originYardName: string; // 兼容旧字段：单仓时=仓名，跨仓时="N 个场地"
  originYardSummary: string;
  originYards: OutboundOriginYard[];
  organizationId: string;
  organizationName: string;
  createdAt: string;
  status: OutboundOrderStatus;
  cancelledAt: string | null;
  cancelledByUserName: string | null;
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
  slot?: {
    id: string;
    line: number;
    row: number;
    zone?: { id: string; code: string; name?: string | null };
    yard?: { id: string; name: string; code: string };
  };
  order?: {
    id: string;
    orderCode: string;
    customerOrderNo: string | null;
    customerId?: string;
  };
}

export interface PlanWaybillPayload {
  outboundOrderId: string; // 必填：本次开单锁定的出库单
  orderVinIds: string[];
  carrierId: string;
  driverId?: string;
  vehicleId?: string;
  towType?: VehicleTowType;
  customerWaybillCode?: string;
  destinationDealerId?: string;
  recipientName?: string;
  recipientPhone?: string;
  remark?: string;
}

export type BlockedReason =
  | 'NOT_ARRIVED'
  | 'NO_SLOT'
  | 'ALREADY_ALLOCATED'
  | 'MISSING_DEALER';

export interface BlockedVinRow {
  id: string;
  vin: string;
  dealerCode: string | null;
  dealerName: string | null;
  reason: BlockedReason;
  slotCode: string | null;
  yardName: string | null;
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
      originYards: OutboundOriginYard[];
      // 客户 Excel 缺 dealerCode 但有 dealerName 时后端自动派生 pseudo code 的台数
      autoDerivedDealerCount?: number;
    }>(apiClient.post('/outbound/orders/import', payload)),

  listOrders: (params?: {
    customerId?: string;
    customerOrderNo?: string;
    organizationId?: string;
    status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    all?: boolean;
  }) =>
    unwrap<Paginated<OutboundOrderListRow>>(
      apiClient.get('/outbound/orders', { params }),
    ),

  orderDetail: (id: string) =>
    unwrap<{
      order: unknown;
      vins: OutboundOrderVinDetail[];
      originYards: OutboundOriginYard[];
    }>(apiClient.get(`/outbound/orders/${id}`)),

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

  listBlocked: (outboundOrderId: string) =>
    unwrap<BlockedVinRow[]>(
      apiClient.get('/outbound/plan/blocked', {
        params: { outboundOrderId },
      }),
    ),

  // DELETE 语义：软取消出库单 (Order 打 CANCELLED + 释放 VIN 出库属性；数据保留供追溯)
  cancelOrder: (id: string) =>
    unwrap<{ ok: boolean }>(apiClient.delete(`/outbound/orders/${id}`)),
};
