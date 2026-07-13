import * as XLSX from 'xlsx';
import type { OutboundVinRow, VehicleTowType } from '@/lib/api/outbound';

// 客户 (BYD) 出库 Excel 常见列 → 系统内部字段
// 与 inbound 分开维护：BYD 出库单里多了 dealer/tow/group 三块
const COLUMN_MAP: Record<string, keyof OutboundVinRow> = {
  vin: 'vin',
  vinno: 'vin',
  vincode: 'vin',
  vinnumber: 'vin',
  brand: 'brand',
  model: 'model',
  modeltype: 'model',
  color: 'color',
  bodycolor: 'color',
  vehicletype: 'vehicleType',
  type: 'vehicleType',
  dealercode: 'dealerCode',
  dealer: 'dealerCode',
  dealername: 'dealerName',
  dealerfull: 'dealerName',
  towtype: 'towType',
  towingtype: 'towType',
  transporttype: 'towType',
  groupcode: 'groupCode',
  group: 'groupCode',
  batchgroup: 'groupCode',
};

const TOW_TYPE_ALIASES: Record<string, VehicleTowType> = {
  cc: 'CC',
  towing: 'TOWING',
  tow: 'TOWING',
  tansya: 'TANSYA',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s._/\-]+/g, '');
}

function normalizeTowType(v: string | undefined): VehicleTowType | undefined {
  if (!v) return undefined;
  const key = v.trim().toLowerCase();
  return TOW_TYPE_ALIASES[key];
}

export interface OutboundParseResult {
  rows: OutboundVinRow[];
  totalReadRows: number;
  headers: string[];
  mappedColumns: Partial<Record<keyof OutboundVinRow, string>>;
  unmappedHeaders: string[];
  invalidTowTypeCount: number;
}

export async function parseOutboundExcel(
  file: File,
): Promise<OutboundParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error('文件里没有工作表');
  const sheet = wb.Sheets[firstSheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  if (raw.length === 0) {
    return {
      rows: [],
      totalReadRows: 0,
      headers: [],
      mappedColumns: {},
      unmappedHeaders: [],
      invalidTowTypeCount: 0,
    };
  }
  const headers = Object.keys(raw[0]);
  const mappedColumns: Partial<Record<keyof OutboundVinRow, string>> = {};
  const unmapped: string[] = [];
  for (const h of headers) {
    const norm = normalizeHeader(h);
    const field = COLUMN_MAP[norm];
    if (field) mappedColumns[field] = h;
    else unmapped.push(h);
  }
  if (!mappedColumns.vin) {
    throw new Error(
      '表格里未找到 VIN 列。请确认列名是 "VIN" / "VIN NO" / "VIN code" 之一',
    );
  }
  if (!mappedColumns.dealerCode && !mappedColumns.dealerName) {
    throw new Error(
      '表格里未找到经销店列 (DealerCode / DealerName)。出库必须知道每台车送去哪个经销店',
    );
  }

  const rows: OutboundVinRow[] = [];
  let invalidTowTypeCount = 0;
  for (const r of raw) {
    const vinRaw = r[mappedColumns.vin] as string;
    if (!vinRaw) continue;
    const vin = String(vinRaw).trim();
    if (!vin) continue;

    const rawTow = pickString(r, mappedColumns.towType);
    const towType = normalizeTowType(rawTow);
    if (rawTow && !towType) invalidTowTypeCount += 1;

    rows.push({
      vin,
      brand: pickString(r, mappedColumns.brand),
      model: pickString(r, mappedColumns.model),
      color: pickString(r, mappedColumns.color),
      vehicleType: pickString(r, mappedColumns.vehicleType),
      dealerCode: pickString(r, mappedColumns.dealerCode),
      dealerName: pickString(r, mappedColumns.dealerName),
      towType,
      groupCode: pickString(r, mappedColumns.groupCode),
    });
  }
  return {
    rows,
    totalReadRows: raw.length,
    headers,
    mappedColumns,
    unmappedHeaders: unmapped,
    invalidTowTypeCount,
  };
}

function pickString(
  row: Record<string, unknown>,
  key: string | undefined,
): string | undefined {
  if (!key) return undefined;
  const v = row[key];
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim();
}
