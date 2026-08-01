import { apiClient, unwrap } from "./client";

export interface DashboardMetric {
  value: number;
  previous: number | null;
  changePercent: number | null;
}

export interface DashboardSlot {
  id: string;
  yardId: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string | null;
  line: number;
  row: number;
  status: "VACANT" | "OCCUPIED" | "LONG_STAY" | "LOCKED";
  currentVin: string | null;
  assignedAt: string | null;
  stayDays: number;
  isLocked: boolean;
  lockedAt: string | null;
}

export interface DashboardAlert {
  id: string;
  type:
    | "UTILIZATION"
    | "LOCK_TIMEOUT"
    | "OVERSTAY"
    | "EXPECTED_ARRIVAL"
    | "DATA_QUALITY_DUPLICATE_VIN"
    | "DATA_QUALITY_INVENTORY_LINK";
  severity: "critical" | "warning" | "info";
  yardId: string;
  yardName: string;
  slotCode?: string;
  title: string;
  detail: string;
  occurredAt: string;
  diagnostics?: {
    issueCode:
      | "DUPLICATE_OCCUPIED_VIN"
      | "INVENTORY_SLOT_LINK_MISMATCH"
      | "MISSING_ORDER_VIN_LINK";
    vin: string;
    organization?: {
      id: string;
      code: string;
      name: string;
    };
    currentSlots: Array<{
      organizationId: string;
      organizationCode: string;
      organizationName: string;
      yardId: string;
      yardCode: string;
      yardName: string;
      slotId: string;
      slotCode: string;
      status: string;
      assignedAt: string | null;
      isLocked: boolean;
    }>;
    effectiveOrderVin?: {
      orderVinId: string;
      orderId: string;
      orderCode: string;
      arrivalStatus: string;
      linkedSlotId: string | null;
      linkedSlotCode: string | null;
      linkedYardId: string | null;
      linkedYardCode: string | null;
      linkedYardName: string | null;
    } | null;
    relatedOrderVins: Array<{
      orderVinId: string;
      orderId: string;
      orderCode: string;
      transportType: string;
      orderStatus: string;
      arrivalStatus: string;
      linkedSlotId: string | null;
      linkedSlotCode: string | null;
      linkedYardId: string | null;
      linkedYardCode: string | null;
      linkedYardName: string | null;
      updatedAt: string;
    }>;
  };
}

export interface DashboardData {
  generatedAt: string;
  timezone: string;
  thresholds: {
    utilizationPercent: number | null;
    lockTimeoutHours: number | null;
    longStayDays: number | null;
  };
  metrics: {
    yards: DashboardMetric;
    totalSlots: DashboardMetric;
    usedSlots: DashboardMetric;
    utilization: DashboardMetric;
    vehiclesOnSite: DashboardMetric;
    inboundToday: DashboardMetric;
    outboundToday: DashboardMetric;
  };
  comparison: {
    monthBaselineDate: string | null;
    dailyBaseline: "yesterday";
  };
  organizations: Array<{ id: string; code: string; name: string }>;
  yards: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    code: string;
    name: string;
    address: string | null;
  }>;
  selectedYardId: string | null;
  slots: DashboardSlot[];
  alerts: DashboardAlert[];
}

export const dashboardApi = {
  get: (params?: {
    organizationId?: string;
    yardId?: string;
    timezone?: string;
  }) => unwrap<DashboardData>(apiClient.get("/dashboard", { params })),
};
