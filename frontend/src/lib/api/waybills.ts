import { apiClient, unwrap } from './client';

export type TransportType = 'TRANSFER' | 'REALLOCATION' | 'DELIVERY';
export type WaybillStatus = 'NOT_ARRIVED' | 'IN_TRANSIT' | 'ARRIVED';
export type ScanAction =
  | 'INBOUND_ARRIVAL'
  | 'REALLOCATION_DEPARTURE'
  | 'REALLOCATION_ARRIVAL'
  | 'DELIVERY_DEPARTURE'
  | 'SIGNED';

export interface WaybillVin {
  id: string;
  vin: string;
  model: string | null;
  color: string | null;
  isSigned: boolean;
  loadedAt: string | null;
  loadPhotoKeys: string[];
}

export interface Waybill {
  id: string;
  waybillCode: string;
  organizationId: string;
  organization?: { id: string; code: string; name: string };
  customerWaybillCode: string | null;
  transportType: TransportType;
  status: WaybillStatus;
  isLocked: boolean;
  carrierId: string | null;
  originYardId: string | null;
  originText: string | null;
  originYard?: { id: string; code: string; name: string };
  destinationYardId: string | null;
  destinationDealerId: string | null;
  destinationDealer?: {
    id: string;
    dealerName: string;
    address: string;
    dealerGroup?: string | null;
    region?: string | null;
    code?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
  };
  carrier?: {
    id: string;
    name: string;
    shortName?: string | null;
    contactPhone?: string | null;
  };
  driver?: {
    id: string;
    name: string;
    phone: string | null;
    licenseNo: string | null;
  };
  vehicle?: {
    id: string;
    plateNumber: string;
    towType: string | null;
  };
  towType: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  remark: string | null;
  vins: WaybillVin[];
  createdAt: string;
}

export const waybillsApi = {
  list: (params?: {
    organizationId?: string;
    status?: WaybillStatus;
    originYardId?: string;
    transportType?: TransportType;
  }) => unwrap<Waybill[]>(apiClient.get('/waybills', { params })),
  get: (id: string) => unwrap<Waybill>(apiClient.get(`/waybills/${id}`)),
  lookup: (vin: string) =>
    unwrap<{ vin: string; isSigned: boolean; waybill: Waybill }>(
      apiClient.get(`/waybills/lookup/${vin}`),
    ),
  scan: (dto: {
    vin: string;
    action: ScanAction;
    yardId?: string;
    attachmentUrls?: string[];
    vehicleCheckInfo?: Record<string, string | number>;
    remark?: string;
  }) => unwrap<Waybill>(apiClient.post('/waybills/scan', dto)),
  cancel: (id: string) =>
    unwrap<{ ok: boolean }>(apiClient.delete(`/waybills/${id}`)),
  loadVin: (
    waybillId: string,
    vin: string,
    payload: { photoKeys: string[]; remark?: string },
  ) =>
    unwrap<{ loadedAt: string; loadedCount: number; totalCount: number }>(
      apiClient.post(`/waybills/${waybillId}/vins/${vin}/load`, payload),
    ),
  unloadVin: (waybillId: string, vin: string) =>
    unwrap<{ loadedCount: number; totalCount: number }>(
      apiClient.delete(`/waybills/${waybillId}/vins/${vin}/load`),
    ),
  depart: (
    waybillId: string,
    payload: { gatePhotoKeys?: string[]; remark?: string },
  ) => unwrap<Waybill>(apiClient.post(`/waybills/${waybillId}/depart`, payload)),
  assign: (
    waybillId: string,
    payload: { driverId?: string | null; vehicleId?: string | null },
  ) =>
    unwrap<Waybill>(apiClient.patch(`/waybills/${waybillId}/assignment`, payload)),
};
