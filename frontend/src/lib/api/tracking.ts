import { apiClient, unwrap } from './client';

export interface WaybillStatusLog {
  id: string;
  vin: string;
  action: string;
  yardId: string | null;
  createdAt: string;
  remark: string | null;
}

export const trackingApi = {
  byVin: (vin: string) => unwrap<WaybillStatusLog[]>(apiClient.get(`/tracking/vin/${vin}`)),
};
