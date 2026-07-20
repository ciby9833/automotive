import * as XLSX from 'xlsx';
import type { CustomerAddressPayload } from '@/lib/api/customers';

// BYD 客户门店 Excel 常见列 → 系统内部字段
// 兼容 "Dealer Group" / "DealerGroup" / "GROUP" 等写法
const COLUMN_MAP: Record<string, keyof CustomerAddressPayload> = {
  dealergroup: 'dealerGroup',
  group: 'dealerGroup',
  branchbyd: 'dealerName',
  branch: 'dealerName',
  dealer: 'dealerName',
  dealername: 'dealerName',
  alamat: 'address',
  address: 'address',
  region: 'region',
  code: 'code',
  dealercode: 'code',
  contact: 'contactName',
  contactname: 'contactName',
  phone: 'contactPhone',
  contactphone: 'contactPhone',
  telp: 'contactPhone',
  telepon: 'contactPhone',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s._/\-]+/g, '');
}

export interface DealerParseResult {
  rows: CustomerAddressPayload[];
  totalReadRows: number;
  headers: string[];
  mappedColumns: Partial<Record<keyof CustomerAddressPayload, string>>;
  unmappedHeaders: string[];
}

// BYD Excel 的 Dealer Group 常用合并单元格：同集团下多分店只在第一行写 group 名。
// 用 lastSeenGroup 变量向下填充（forward-fill）保持每行都有 group。
export async function parseDealerExcel(file: File): Promise<DealerParseResult> {
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
  const mappedColumns: Partial<Record<keyof CustomerAddressPayload, string>> = {};
  const unmapped: string[] = [];
  for (const h of headers) {
    const norm = normalizeHeader(h);
    const field = COLUMN_MAP[norm];
    if (field) mappedColumns[field] = h;
    else unmapped.push(h);
  }
  if (!mappedColumns.dealerName) {
    throw new Error(
      '表格里未找到分店名列 (Branch BYD / Dealer / DealerName)',
    );
  }
  if (!mappedColumns.address) {
    throw new Error('表格里未找到地址列 (Alamat / Address)');
  }

  const rows: CustomerAddressPayload[] = [];
  let lastSeenGroup: string | undefined;
  for (const r of raw) {
    const dealerName = pickString(r, mappedColumns.dealerName);
    if (!dealerName) continue;
    const address = pickString(r, mappedColumns.address);
    if (!address) continue;

    const groupRaw = pickString(r, mappedColumns.dealerGroup);
    if (groupRaw) lastSeenGroup = groupRaw;

    rows.push({
      dealerGroup: lastSeenGroup,
      dealerName,
      address,
      code: pickString(r, mappedColumns.code),
      region: pickString(r, mappedColumns.region),
      contactName: pickString(r, mappedColumns.contactName),
      contactPhone: pickString(r, mappedColumns.contactPhone),
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
