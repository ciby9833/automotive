import * as XLSX from 'xlsx';

// 场内库位批量分配的 Excel 处理：模板生成 + 解析
// 表头两列：VIN、SlotCode；大小写、空格、下划线均可
export interface BatchAssignRow {
  vin: string;
  slotCode: string;
}

export function downloadBatchAssignTemplate(): void {
  const headers = ['VIN', 'SlotCode'];
  const sample = [
    { VIN: 'LGXCE4CB0TG022162', SlotCode: 'A-01' },
    { VIN: 'LGXCE4CB0TG022163', SlotCode: 'A-02' },
    { VIN: 'LGXCE4CB0TG022164', SlotCode: 'B-05' },
  ];
  const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BatchAssign');
  XLSX.writeFile(wb, 'yard-batch-assign-template.xlsx');
}

const VIN_ALIASES = ['vin', 'vin号', '车架号', 'chassis', 'chassisno'];
const SLOT_ALIASES = ['slotcode', 'slot', 'slotno', '库位', '库位码', 'slot_code'];

function normalize(k: string): string {
  return k.toLowerCase().replace(/[\s_\-]/g, '');
}

export async function parseBatchAssignExcel(file: File): Promise<{
  rows: BatchAssignRow[];
  totalReadRows: number;
  mappedColumns: { vin?: string; slotCode?: string };
  unmappedHeaders: string[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error('文件里没有工作表');
  const sheet = wb.Sheets[firstSheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  if (raw.length === 0) throw new Error('文件里没有数据行');

  // 表头识别：把每列 header 归一化后按别名列表匹配
  const firstRow = raw[0];
  const headerMap: { vin?: string; slotCode?: string } = {};
  const unmapped: string[] = [];
  for (const header of Object.keys(firstRow)) {
    const norm = normalize(header);
    if (VIN_ALIASES.includes(norm)) headerMap.vin = header;
    else if (SLOT_ALIASES.includes(norm)) headerMap.slotCode = header;
    else unmapped.push(header);
  }
  if (!headerMap.vin || !headerMap.slotCode) {
    throw new Error('未识别到必填列 VIN 或 SlotCode，请下载模板对照表头');
  }

  const rows: BatchAssignRow[] = [];
  for (const r of raw) {
    const vin = String(r[headerMap.vin] ?? '').trim();
    const slotCode = String(r[headerMap.slotCode] ?? '').trim();
    if (!vin || !slotCode) continue;
    rows.push({ vin, slotCode });
  }

  return {
    rows,
    totalReadRows: raw.length,
    mappedColumns: headerMap,
    unmappedHeaders: unmapped,
  };
}
