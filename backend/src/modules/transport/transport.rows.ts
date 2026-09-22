/** PostgreSQL 结果形状：timestamptz 为 Date，date 为 'YYYY-MM-DD' 字符串。 */
export interface OrderRow {
  id: string;
  code: string;
  organization_id: string;
  customer_id: string;
  customer_request_no: string;
  planned_pickup_date: string | null;
  planned_delivery_date: string | null;
  source: 'MANUAL' | 'EXCEL' | 'API';
  remark: string;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  created_by: string;
  created_at: Date;
  completed_at: Date | null;
}

export type LineStatus =
  | 'UNALLOCATED'
  | 'ALLOCATED'
  | 'DISPATCHED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

export interface LineRow {
  id: string;
  order_id: string;
  organization_id: string;
  customer_id: string;
  line_no: number;
  vin: string | null;
  origin_id: string;
  destination_id: string;
  vehicle_config: string;
  vehicle_model: string;
  vehicle_color: string;
  tow_type: 'CC' | 'TANSYA' | 'TOWING' | null;
  carrier_id: string | null;
  trip_id: string | null;
  status: LineStatus;
  picked_up_at: Date | null;
  picked_up_by: string | null;
  pickup_photos: string[];
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  delivered_at: Date | null;
  delivered_by: string | null;
  delivery_photos: string[];
  end_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export type TripStatus =
  | 'PLANNED'
  | 'LOADING'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED';

export interface TripRow {
  id: string;
  code: string;
  organization_id: string;
  carrier_id: string;
  driver_id: string;
  vehicle_id: string;
  tow_type: 'CC' | 'TANSYA' | 'TOWING';
  capacity: number;
  status: TripStatus;
  created_by: string;
  created_at: Date;
  departed_at: Date | null;
  completed_at: Date | null;
  cancel_reason: string | null;
}

export interface ExceptionRow {
  id: string;
  organization_id: string;
  trip_id: string;
  line_id: string | null;
  vin: string | null;
  type: 'UNPLANNED_VIN' | 'DAMAGE' | 'REFUSED' | 'OTHER';
  status: 'OPEN' | 'RESOLVED' | 'RECORDED';
  note: string;
  photos: string[];
  resolution: string | null;
  resolution_reason: string | null;
  reported_by: string;
  reported_at: Date;
  resolved_by: string | null;
  resolved_at: Date | null;
}

export interface AddressRow {
  id: string;
  customer_id: string;
  code: string | null;
  dealerName: string;
  region: string | null;
  kind: string;
  isActive: boolean;
}

export interface TariffRow {
  id: string;
  organization_id: string;
  side: 'RECEIVABLE' | 'PAYABLE';
  customer_id: string;
  carrier_id: string | null;
  origin_id: string;
  destination_id: string | null;
  destination_region: string | null;
  tow_type: 'CC' | 'TANSYA' | 'TOWING';
  price: string;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  remark: string;
}

export interface ChargeRow {
  id: string;
  organization_id: string;
  line_id: string;
  trip_id: string;
  side: 'RECEIVABLE' | 'PAYABLE';
  customer_id: string;
  carrier_id: string | null;
  tariff_id: string | null;
  amount: string;
  currency: string;
  pricing: 'TARIFF' | 'UNPRICED' | 'MANUAL';
  status: 'PENDING' | 'CONFIRMED';
  service_date: string;
  manual_reason: string | null;
}
