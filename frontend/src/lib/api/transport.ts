import { apiClient, unwrap } from "./client";

export type TowType = "CC" | "TANSYA" | "TOWING";
export type LineStatus =
  | "UNALLOCATED"
  | "ALLOCATED"
  | "DISPATCHED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CLOSED"
  | "CANCELLED";
export type TripStatus = "PLANNED" | "LOADING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface TransportOrder {
  id: string;
  code: string;
  organization_id: string;
  customer_id: string;
  customer_name: string;
  customer_request_no: string;
  planned_pickup_date: string | null;
  planned_delivery_date: string | null;
  source: "MANUAL" | "EXCEL" | "API";
  remark: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  created_at: string;
  line_count?: number;
  delivered_count?: number;
  moving_count?: number;
  unallocated_count?: number;
  missing_vin_count?: number;
}

export interface TransportLine {
  id: string;
  order_id: string;
  order_code: string;
  customer_request_no: string;
  customer_id: string;
  customer_name: string;
  line_no: number;
  vin: string | null;
  origin_id: string;
  origin_code: string | null;
  origin_name: string;
  destination_id: string;
  destination_code: string | null;
  destination_name: string;
  destination_region: string | null;
  vehicle_config: string;
  vehicle_model: string;
  vehicle_color: string;
  tow_type: TowType | null;
  carrier_id: string | null;
  carrier_name: string | null;
  carrier_short_name: string | null;
  trip_id: string | null;
  trip_code: string | null;
  trip_status: TripStatus | null;
  status: LineStatus;
  planned_pickup_date: string | null;
  planned_delivery_date: string | null;
  picked_up_at: string | null;
  pickup_photos: string[];
  delivered_at: string | null;
  delivery_photos: string[];
  end_reason: string | null;
}

export interface TransportEvent {
  id: string;
  action: string;
  vin: string | null;
  reason: string;
  payload: Record<string, unknown>;
  created_at: string;
  operator_name: string;
}

export interface TransportDocument {
  id: string;
  trip_id?: string;
  trip_code?: string;
  origin_id: string;
  destination_id: string;
  file_key: string;
  file_name: string;
  mime_type: string;
  created_at: string;
}

export interface OrderDetail {
  order: TransportOrder;
  lines: TransportLine[];
  events: TransportEvent[];
  documents: TransportDocument[];
}

export interface TransportTrip {
  id: string;
  code: string;
  organization_id: string;
  carrier_id: string;
  driver_id: string;
  vehicle_id: string;
  tow_type: TowType;
  capacity: number;
  status: TripStatus;
  created_at: string;
  departed_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  carrier_name: string;
  driver_name: string;
  driver_phone: string | null;
  plate_number: string;
  line_count?: number;
  loaded_count?: number;
  delivered_count?: number;
  origins?: string | null;
  destinations?: string | null;
  open_exceptions?: number;
}

export interface TripLeg {
  originId: string;
  originCode: string | null;
  originName: string;
  destinationId: string;
  destinationCode: string | null;
  destinationName: string;
  lines: number;
  loaded: number;
  delivered: number;
  documents: TransportDocument[];
}

export interface TransportException {
  id: string;
  trip_id: string;
  trip_code?: string;
  trip_status?: TripStatus;
  carrier_name?: string;
  line_id: string | null;
  vin: string | null;
  type: "UNPLANNED_VIN" | "DAMAGE" | "REFUSED" | "OTHER";
  status: "OPEN" | "RESOLVED" | "RECORDED";
  note: string;
  photos: string[];
  resolution: string | null;
  resolution_reason: string | null;
  reported_by_name: string;
  reported_at: string;
}

export interface TripDetail {
  trip: TransportTrip;
  lines: TransportLine[];
  legs: TripLeg[];
  exceptions: TransportException[];
  events: TransportEvent[];
}

export interface TransportLineInput {
  vin?: string;
  quantity?: number;
  originId: string;
  destinationId: string;
  vehicleConfig?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  towType?: TowType;
  carrierId?: string;
}

export interface CreateOrderInput {
  customerId: string;
  customerRequestNo: string;
  plannedPickupDate?: string;
  plannedDeliveryDate?: string;
  remark?: string;
  lines: TransportLineInput[];
}

export interface ImportRow {
  row: number;
  customerRequestNo: string;
  vin?: string;
  quantity?: string;
  origin: string;
  dealer: string;
  vehicleConfig?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  armada?: string;
  vendor?: string;
  plannedPickupDate?: string;
  plannedDeliveryDate?: string;
  remark?: string;
}

export interface ImportResult {
  errors: { row: number; message: string }[];
  orders: {
    customerRequestNo: string;
    lineCount: number;
    withVin: number;
    allocated: number;
    plannedPickupDate: string | null;
    plannedDeliveryDate: string | null;
  }[];
  created: TransportOrder[];
}

export interface Tariff {
  id: string;
  side: "RECEIVABLE" | "PAYABLE";
  customer_id: string;
  customer_name: string;
  carrier_id: string | null;
  carrier_name: string | null;
  origin_id: string;
  origin_code: string | null;
  origin_name: string;
  destination_id: string | null;
  destination_code: string | null;
  destination_name: string | null;
  destination_region: string | null;
  tow_type: TowType;
  price: string;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  remark: string;
}

export interface TariffInput {
  side: "RECEIVABLE" | "PAYABLE";
  customerId: string;
  carrierId?: string;
  originId: string;
  destinationId?: string;
  destinationRegion?: string;
  towType: TowType;
  price: number;
  validFrom: string;
  validTo?: string | null;
  remark?: string;
}

export interface Charge {
  id: string;
  line_id: string;
  trip_id: string;
  side: "RECEIVABLE" | "PAYABLE";
  customer_id: string;
  carrier_id: string | null;
  amount: string;
  currency: string;
  pricing: "TARIFF" | "UNPRICED" | "MANUAL";
  status: "PENDING" | "CONFIRMED";
  service_date: string;
  manual_reason: string | null;
  vin: string;
  tow_type: TowType;
  trip_code: string;
  order_code: string;
  customer_name: string;
  carrier_name: string | null;
  origin_code: string | null;
  origin_name: string;
  destination_code: string | null;
  destination_name: string;
  destination_region: string | null;
}

export interface ChargeTotals {
  side: "RECEIVABLE" | "PAYABLE";
  currency: string;
  amount: string;
  count: number;
  unpriced: number;
}

export type PickupResult =
  | { result: "PICKED"; line: TransportLine }
  | { result: "CHOOSE_LINE"; vin: string; options: TransportLine[] }
  | { result: "UNPLANNED"; vin: string; exception: TransportException };

type Query = Record<string, string | number | undefined>;
const clean = (q: Query) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== ""));

export const transportApi = {
  orders: (q: Query) =>
    unwrap<Paged<TransportOrder>>(apiClient.get("/transport/orders", { params: clean(q) })),
  order: (id: string) => unwrap<OrderDetail>(apiClient.get(`/transport/orders/${id}`)),
  createOrder: (d: CreateOrderInput) =>
    unwrap<TransportOrder>(apiClient.post("/transport/orders", d)),
  importOrders: (customerId: string, rows: ImportRow[], dryRun: boolean) =>
    unwrap<ImportResult>(apiClient.post("/transport/orders/import", { customerId, rows, dryRun })),
  supplementVins: (orderId: string, items: { lineId: string; vin: string }[]) =>
    unwrap<{ updated: number }>(apiClient.post(`/transport/orders/${orderId}/vins`, { items })),
  cancelOrder: (orderId: string, reason: string) =>
    unwrap<{ cancelled: number }>(apiClient.post(`/transport/orders/${orderId}/cancel`, { reason })),

  lines: (q: Query) =>
    unwrap<Paged<TransportLine>>(apiClient.get("/transport/lines", { params: clean(q) })),
  updateLine: (id: string, d: { vin?: string | null; vehicleConfig?: string; vehicleModel?: string; vehicleColor?: string }) =>
    unwrap<TransportLine>(apiClient.patch(`/transport/lines/${id}`, d)),
  allocate: (lineIds: string[], carrierId: string, towType: TowType) =>
    unwrap<{ updated: number }>(apiClient.post("/transport/lines/allocate", { lineIds, carrierId, towType })),
  cancelLines: (lineIds: string[], reason: string) =>
    unwrap<{ cancelled: number }>(apiClient.post("/transport/lines/cancel", { lineIds, reason })),
  closeLine: (id: string, reason: string) =>
    unwrap<{ ok: boolean }>(apiClient.post(`/transport/lines/${id}/close`, { reason })),
  vinHistory: (vin: string) =>
    unwrap<{ vin: string; lines: TransportLine[]; events: (TransportEvent & { order_id: string; trip_id: string })[] }>(
      apiClient.get(`/transport/vins/${encodeURIComponent(vin)}/history`),
    ),

  trips: (q: Query) =>
    unwrap<Paged<TransportTrip>>(apiClient.get("/transport/trips", { params: clean(q) })),
  trip: (id: string) => unwrap<TripDetail>(apiClient.get(`/transport/trips/${id}`)),
  createTrip: (d: { carrierId: string; driverId: string; vehicleId: string; lineIds: string[] }) =>
    unwrap<TransportTrip>(apiClient.post("/transport/trips", d)),
  addTripLines: (id: string, lineIds: string[]) =>
    unwrap<{ added: number }>(apiClient.post(`/transport/trips/${id}/lines`, { lineIds })),
  removeTripLines: (id: string, lineIds: string[], reason?: string) =>
    unwrap<{ removed: number }>(apiClient.post(`/transport/trips/${id}/lines/remove`, { lineIds, reason })),
  cancelTrip: (id: string, reason: string) =>
    unwrap<{ ok: boolean }>(apiClient.post(`/transport/trips/${id}/cancel`, { reason })),
  pickup: (id: string, vin: string, lineId?: string) =>
    unwrap<PickupResult>(apiClient.post(`/transport/trips/${id}/pickup`, { vin, lineId })),
  depart: (id: string) =>
    unwrap<{ ok: boolean; returned: number }>(apiClient.post(`/transport/trips/${id}/depart`)),
  sign: (id: string, vin: string) =>
    unwrap<{ result: string; line: TransportLine }>(apiClient.post(`/transport/trips/${id}/sign`, { vin })),
  recordException: (id: string, d: { type: "DAMAGE" | "REFUSED" | "OTHER"; vin?: string; note: string }) =>
    unwrap<TransportException>(apiClient.post(`/transport/trips/${id}/exceptions`, d)),
  uploadDocument: (id: string, originId: string, destinationId: string, file: File) => {
    const form = new FormData();
    form.append("originId", originId);
    form.append("destinationId", destinationId);
    form.append("file", file);
    return unwrap<TransportDocument>(apiClient.post(`/transport/trips/${id}/documents`, form));
  },

  exceptions: (q: Query) =>
    unwrap<Paged<TransportException>>(apiClient.get("/transport/exceptions", { params: clean(q) })),
  resolveException: (
    id: string,
    d: { decision: "BIND" | "ADD" | "REJECT"; reason: string; lineId?: string; orderId?: string; originId?: string; destinationId?: string },
  ) => unwrap<{ ok: boolean }>(apiClient.post(`/transport/exceptions/${id}/resolve`, d)),

  tariffs: (q: Query) => unwrap<Tariff[]>(apiClient.get("/transport/tariffs", { params: clean(q) })),
  createTariff: (d: TariffInput) => unwrap<Tariff>(apiClient.post("/transport/tariffs", d)),
  updateTariff: (id: string, d: TariffInput) => unwrap<Tariff>(apiClient.patch(`/transport/tariffs/${id}`, d)),
  deleteTariff: (id: string) => unwrap<{ ok: boolean }>(apiClient.delete(`/transport/tariffs/${id}`)),

  charges: (q: Query) =>
    unwrap<Paged<Charge> & { totals: ChargeTotals[] }>(apiClient.get("/transport/charges", { params: clean(q) })),
  adjustCharge: (id: string, amount: number, reason: string) =>
    unwrap<Charge>(apiClient.patch(`/transport/charges/${id}`, { amount, reason })),
  confirmCharges: (ids: string[]) =>
    unwrap<{ confirmed: number }>(apiClient.post("/transport/charges/confirm", { ids })),
  recalculate: (d: { from?: string; to?: string; customerId?: string; includeManual?: boolean }) =>
    unwrap<{ checked: number; updated: number }>(apiClient.post("/transport/charges/recalculate", d)),
};
