// 前端统一分页返回类型：与后端 PaginatedResult 对齐
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// AntD Table 排序 → 后端 sortBy/sortOrder
export type SortOrder = 'ascend' | 'descend' | null | undefined;

export function antdOrderToApi(order: SortOrder): 'asc' | 'desc' | undefined {
  if (order === 'ascend') return 'asc';
  if (order === 'descend') return 'desc';
  return undefined;
}

// 常用 pageSize 选项 —— 用户可切
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];
