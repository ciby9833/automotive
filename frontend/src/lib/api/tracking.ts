import { apiClient, unwrap } from './client';

export interface WaybillStatusLog {
  id: string;
  vin: string;
  action: string;
  yardId: string | null;
  createdAt: string;
  remark: string | null;
}

// 全生命周期时间线单条记录 (归一化 OperationLog + WaybillStatusLog)
// occurredAt = 业务发生时间 (排序权威)；createdAt = 记录写入时间 (调试)
export interface TimelineEntry {
  source: 'operation' | 'waybill_scan';
  occurredAt: string;
  createdAt: string;
  type: string;
  vin: string | null;
  orderId: string | null;
  waybillId: string | null;
  yard: { id: string; name: string; code: string } | null;
  slot: { id: string; code: string } | null;
  operator: { id: string; displayName: string } | null;
  attachmentUrls: string[] | null;
  payload: Record<string, unknown> | null;
  remark: string | null;
}

export const trackingApi = {
  byVin: (vin: string) =>
    unwrap<WaybillStatusLog[]>(apiClient.get(`/tracking/vin/${vin}`)),
  timelineByVin: (vin: string) =>
    unwrap<TimelineEntry[]>(apiClient.get(`/tracking/timeline/vin/${vin}`)),
  timelineByOrder: (orderId: string) =>
    unwrap<TimelineEntry[]>(
      apiClient.get(`/tracking/timeline/order/${orderId}`),
    ),
};
