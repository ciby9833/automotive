// 统一分页返回体。前端拿到后走 AntD Table 的 controlled pagination + 后端排序
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// 分页/排序/导出的入参归一：所有列表端点共用
export interface ListQueryOptions {
  page?: number; // 1-based，默认 1
  pageSize?: number; // 默认 20；all=true 时忽略
  sortBy?: string; // 白名单校验，未命中回落到 default
  sortOrder?: 'asc' | 'desc'; // 默认 desc
  all?: boolean; // 导出用：跳过分页返全量
}

// 导出安全阀：结果超过这个数直接 400 拒绝，避免拖垮服务
// 与"缩短时间范围"的产品提示保持一致
export const EXPORT_MAX_ROWS = 1_000_000;
export const DEFAULT_PAGE_SIZE = 20;

// 统一解析 query string → ListQueryOptions
export function parseListQuery(raw: {
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortOrder?: string;
  all?: string;
}): ListQueryOptions {
  const page = raw.page ? Math.max(1, Number(raw.page)) : 1;
  const pageSize = raw.pageSize ? Math.max(1, Math.min(500, Number(raw.pageSize))) : DEFAULT_PAGE_SIZE;
  const all = raw.all === 'true' || raw.all === '1';
  const sortOrder: 'asc' | 'desc' =
    raw.sortOrder === 'asc' ? 'asc' : 'desc';
  return {
    page,
    pageSize,
    sortBy: raw.sortBy,
    sortOrder,
    all,
  };
}

// 从 whitelist 里挑安全的排序列，未命中就用 default 兜底（防 SQL 注入）
export function resolveSortColumn(
  requested: string | undefined,
  whitelist: Record<string, string>, // { camelCaseKey: 'qb.alias.column' }
  defaultColumn: string,
): string {
  if (!requested) return defaultColumn;
  return whitelist[requested] ?? defaultColumn;
}
