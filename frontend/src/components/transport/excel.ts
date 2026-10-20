import * as XLSX from "xlsx";
import type { ImportRow } from "@/lib/api/transport";

/** 模板列与业务线下派单表对齐；一行一台车，没有 VIN 时填 Quantity。 */
export const TRANSPORT_COLUMNS = [
  "Customer",
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
  "Group",
  "PlannedPickupDate",
  "PlannedDeliveryDate",
  "Remark",
] as const;

// 线下表常见的中英文表头也能识别，例如“发货地址名称-Origin”
const ALIASES: Record<string, (typeof TRANSPORT_COLUMNS)[number]> = {
  CUSTOMERREQUESTNO: "CustomerRequestNo",
  REQUESTNO: "CustomerRequestNo",
  CUSTOMER: "Customer",
  CUSTOMERCODE: "Customer",
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
  GROUP: "Group",
  GROUPCODE: "Group",
  BATCHGROUP: "Group",
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
  return String(v ?? "").trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 日期列统一成 YYYY-MM-DD。
 * - Excel 日期格子：按日期序列号直接换算年月日。不能让 SheetJS 转成 Date——它按本地时区（含历史时区偏移）换算，
 *   雅加达时区下会变成前一天 23:59:48，导致日期整整早一天。
 * - 文本：认 2026-10-21 / 2026/10/21 / 2026.10.21，以及印尼常用的日在前写法 21/10/2026、21-10-2026、21.10.2026；
 *   带时间的只取日期部分。认不出的原样交给后端报错，不猜。
 */
export function dateCell(v: unknown): string {
  if (typeof v === "number" && v > 0) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const text = cellText(v).split(/[ T]/)[0];
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return text;
}

export async function readTransportExcel(file: File): Promise<ImportRow[]> {
  // 不开 cellDates：日期保留为序列号，由 dateCell 换算，避免时区把日期推前一天
  const wb = XLSX.read(await file.arrayBuffer());
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
    const date = (col: "PlannedPickupDate" | "PlannedDeliveryDate") => {
      const idx = header.indexOf(col);
      return idx < 0 ? "" : dateCell((cells as unknown[])[idx]);
    };
    if (!TRANSPORT_COLUMNS.some((c) => get(c))) return;
    rows.push({
      row: i + 2,
      customer: get("Customer") || undefined,
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
      group: get("Group") || undefined,
      plannedPickupDate: date("PlannedPickupDate") || undefined,
      plannedDeliveryDate: date("PlannedDeliveryDate") || undefined,
      remark: get("Remark") || undefined,
    });
  });
  if (!rows.length) throw new Error("Excel 没有数据行");
  return rows;
}

export function downloadTransportTemplate() {
  const sample = [
    ["GEELY", "CUST-0918-01", "MGEEH40FXTJ009399", "", "GEELY-Purwakarta", "GEELY-001", "E22H-MAX-INT.WHITE-TT", "EX2", "YELLOW/WHITE-TT", "CC", "JNT", "CC1", "2026-09-20", "2026-09-22", ""],
    ["GEELY", "CUST-0918-01", "", "3", "GEELY-Purwakarta", "GEELY-002", "", "", "", "CC", "", "CC1", "2026-09-20", "2026-09-22", "VIN 后补；同组跟着 CC1 派给 JNT"],
    ["BYD", "BYD-0918-07", "LC0C76C4XS1234567", "", "BYD-Subang", "BYD-D01", "", "", "", "TANSYA", "", "TANSYA1", "2026-09-21", "2026-09-23", "另一个客户、另一个订单号、另一组"],
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
