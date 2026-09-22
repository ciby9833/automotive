import * as XLSX from "xlsx";
import type { ImportRow } from "@/lib/api/transport";

/** 模板列与业务线下派单表对齐；一行一台车，没有 VIN 时填 Quantity。 */
export const TRANSPORT_COLUMNS = [
  "CustomerRequestNo",
  "VIN",
  "Quantity",
  "Origin",
  "Dealer",
  "Type",
  "Model",
  "Color",
  "Armada",
  "Vendor",
  "PlannedPickupDate",
  "PlannedDeliveryDate",
  "Remark",
] as const;

// 线下表常见的中英文表头也能识别，例如“发货地址名称-Origin”
const ALIASES: Record<string, (typeof TRANSPORT_COLUMNS)[number]> = {
  CUSTOMERREQUESTNO: "CustomerRequestNo",
  REQUESTNO: "CustomerRequestNo",
  VIN: "VIN",
  QUANTITY: "Quantity",
  QTY: "Quantity",
  ORIGIN: "Origin",
  DEALER: "Dealer",
  DESTINATION: "Dealer",
  TYPE: "Type",
  MODEL: "Model",
  COLOR: "Color",
  ARMADA: "Armada",
  VENDOR: "Vendor",
  PLANNEDPICKUPDATE: "PlannedPickupDate",
  PLANNEDDELIVERYDATE: "PlannedDeliveryDate",
  REMARK: "Remark",
  REMARKS: "Remark",
};

function headerKey(raw: string): (typeof TRANSPORT_COLUMNS)[number] | undefined {
  // “车辆颜色-Color” → COLOR；“CustomerRequestNo” → CUSTOMERREQUESTNO
  const tail = raw.includes("-") ? raw.slice(raw.lastIndexOf("-") + 1) : raw;
  return ALIASES[tail.replace(/[^A-Za-z]/g, "").toUpperCase()];
}

function cellText(v: unknown): string {
  if (v instanceof Date) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  return String(v ?? "").trim();
}

export async function readTransportExcel(file: File): Promise<ImportRow[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
  if (matrix.length < 2) throw new Error("Excel 没有数据行");
  const header = (matrix[0] as unknown[]).map((h) => headerKey(cellText(h)));
  const rows: ImportRow[] = [];
  matrix.slice(1).forEach((cells, i) => {
    const get = (col: (typeof TRANSPORT_COLUMNS)[number]) => {
      const idx = header.indexOf(col);
      return idx < 0 ? "" : cellText((cells as unknown[])[idx]);
    };
    if (!TRANSPORT_COLUMNS.some((c) => get(c))) return;
    rows.push({
      row: i + 2,
      customerRequestNo: get("CustomerRequestNo"),
      vin: get("VIN").toUpperCase() || undefined,
      quantity: get("Quantity") || undefined,
      origin: get("Origin"),
      dealer: get("Dealer"),
      vehicleConfig: get("Type") || undefined,
      vehicleModel: get("Model") || undefined,
      vehicleColor: get("Color") || undefined,
      armada: get("Armada") || undefined,
      vendor: get("Vendor") || undefined,
      plannedPickupDate: get("PlannedPickupDate") || undefined,
      plannedDeliveryDate: get("PlannedDeliveryDate") || undefined,
      remark: get("Remark") || undefined,
    });
  });
  if (!rows.length) throw new Error("Excel 没有数据行");
  return rows;
}

export function downloadTransportTemplate() {
  const sample = [
    ["CUST-0918-01", "MGEEH40FXTJ009399", "", "GEELY-Purwakarta", "GEELY-001", "E22H-MAX-INT.WHITE-TT", "EX2", "YELLOW/WHITE-TT", "CC", "JNT", "2026-09-20", "2026-09-22", ""],
    ["CUST-0918-01", "", "3", "GEELY-Purwakarta", "GEELY-002", "", "", "", "TANSYA", "", "2026-09-20", "2026-09-22", "VIN 后补"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([[...TRANSPORT_COLUMNS], ...sample]);
  ws["!cols"] = TRANSPORT_COLUMNS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transport");
  XLSX.writeFile(wb, "transport-template.xlsx");
}

/** 补 VIN：从粘贴文本拆出 VIN 列表 */
export function splitVins(text: string): string[] {
  return text
    .split(/[\s,;，；]+/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}
