import * as XLSX from 'xlsx';
import type { InboundVinRow } from '@/lib/api/inbound';

// 稳定的列名映射表：BYD Excel 常见列 → 系统内部字段
// 极兔操作员线下把客户表 header 改成这些标准列名再导入
const COLUMN_MAP: Record<string, keyof InboundVinRow> = {
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
  motorno: 'motorNo',
  motornumber: 'motorNo',
  engine: 'motorNo',
  engineno: 'motorNo',
};

// 规范化：小写、去空格、去下划线/斜杠等分隔符
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s._/\-]+/g, '');
}

export interface ParseResult {
  rows: InboundVinRow[];
  totalReadRows: number;
  headers: string[];
  mappedColumns: Partial<Record<keyof InboundVinRow, string>>;
  unmappedHeaders: string[];
}

// 支持 .xlsx / .xls / .csv 三种格式，客户端浏览器解析
export async function parseInboundExcel(file: File): Promise<ParseResult> {
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
    };
  }
  const headers = Object.keys(raw[0]);
  const mappedColumns: Partial<Record<keyof InboundVinRow, string>> = {};
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
  const rows: InboundVinRow[] = [];
  for (const r of raw) {
    const vinRaw = r[mappedColumns.vin] as string;
    if (!vinRaw) continue;
    const vin = String(vinRaw).trim();
    if (!vin) continue;
    rows.push({
      vin,
      brand: pickString(r, mappedColumns.brand),
      model: pickString(r, mappedColumns.model),
      color: pickString(r, mappedColumns.color),
      vehicleType: pickString(r, mappedColumns.vehicleType),
      motorNo: pickString(r, mappedColumns.motorNo),
    });
  }
  return {
    rows,
    totalReadRows: raw.length,
    headers,
    mappedColumns,
    unmappedHeaders: unmapped,
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
