import * as XLSX from 'xlsx';

// 通用 xlsx 导出：以当前页面已加载的行为准，保持"所见即所得"
// 大数据集用户先在 UI 上过滤到目标范围再导出；单表最多 5000 行硬顶
const MAX_ROWS = 5000;

export interface ExportColumn<T> {
  header: string;
  // 允许直接取字段路径 'a.b.c'，或传函数返回值
  accessor: keyof T | ((row: T) => unknown);
  // 时间列格式化时可用；日期类会自动 ISO 化
  format?: (v: unknown, row: T) => string | number | boolean | null;
}

function pick(row: unknown, path: string): unknown {
  if (row == null) return undefined;
  return path
    .split('.')
    .reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), row);
}

export function exportRowsToXlsx<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  fileName: string,
  sheetName = 'Sheet1',
): void {
  if (rows.length > MAX_ROWS) {
    // 静默截断反而危险 — 抛错让调用方决定
    throw new Error(
      `导出行数超过上限 ${MAX_ROWS}（当前 ${rows.length}），请缩小筛选范围再试`,
    );
  }
  const aoa: Array<Array<string | number | boolean | null>> = [
    columns.map((c) => c.header),
  ];
  for (const row of rows) {
    aoa.push(
      columns.map((c) => {
        let v: unknown;
        if (typeof c.accessor === 'function') {
          v = c.accessor(row);
        } else if (typeof c.accessor === 'string' && c.accessor.includes('.')) {
          v = pick(row, c.accessor);
        } else {
          v = (row as Record<string, unknown>)[c.accessor as string];
        }
        if (c.format) v = c.format(v, row);
        if (v == null || v === '') return '';
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
          return v;
        // 兜底：任何对象/数组 stringify（避免 excel 里出现 [object Object]）
        return JSON.stringify(v);
      }),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

// 常用格式化：ISO 时间戳 → 本地日期时间字符串（Excel 里更好读）
export const formatDateTime = (v: unknown): string => {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : (v as Date);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
};
