import { apiClient, unwrap } from './client';

export interface WaybillStatusLog {
  id: string;
  vin: string;
  action: string;
  yardId: string | null;
  createdAt: string;
  remark: string | null;
}

// 全生命周期时间线单条记录 (合并 OperationLog + WaybillStatusLog)
// source: 用于 UI 区分节点类型
// type: OperationType 或 ScanAction 之一 (字符串枚举)
export interface TimelineEntry {
  source: 'operation' | 'waybill_scan';
  createdAt: string;
  type: string;
  vin: string | null;
  orderId: string | null;
  waybillId: string | null;
  yardId: string | null;
  operator: { id: string; displayName: string } | null;
  attachmentUrls?: string[] | null;
  payload: Record<string, unknown> | null;
  remark?: string | null;
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
