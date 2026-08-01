import { YardSlot } from './entities/yard-slot.entity';
import { YardZone } from './entities/yard-zone.entity';

// 显示编码规则：`${zone.code}-${line:02}-${row:02}`（如 "AB6-01-07"）
// slot 表不再存 code；zone 改名后所有历史 slot 展示自动跟随
const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatSlotCode(zoneCode: string, line: number, row: number): string {
  return `${zoneCode}-${pad2(line)}-${pad2(row)}`;
}

// 便捷：加载了 zone relation 的 slot 直接算出展示码
export function slotDisplayCode(slot: { zone?: YardZone | null; line: number; row: number }): string {
  if (!slot.zone?.code) return '';
  return formatSlotCode(slot.zone.code, slot.line, slot.row);
}

// SQL 片段：`${alias}` 需已 JOIN 对应 zone，别名 `${zoneAlias}`；输出 `${zoneAlias}.code || '-' || LPAD(...) || '-' || LPAD(...)`
export function slotDisplayCodeSql(slotAlias: string, zoneAlias: string): string {
  return `(${zoneAlias}.code || '-' || LPAD(${slotAlias}."line"::text, 2, '0') || '-' || LPAD(${slotAlias}."row"::text, 2, '0'))`;
}

// 解析用户输入的库位码：'AB6-01-07' → { zoneCode: 'AB6', line: 1, row: 7 }
// 兼容大小写和多余空格；zone code 内如含 '-' 会解析失败（业务约定 zone code 不含破折号）
// 使用 zone code 内不含 '-' 的假设：把 zone code 视为最后两段 '-NN-NN' 之前的所有内容
export interface ParsedSlotCode {
  zoneCode: string;
  line: number;
  row: number;
}

export function parseSlotCode(input: string): ParsedSlotCode | null {
  if (!input) return null;
  const trimmed = input.trim();
  // 最后两段必须是 '-NN-NN' 数字
  const m = trimmed.match(/^(.+)-(\d{1,3})-(\d{1,3})$/);
  if (!m) return null;
  const zoneCode = m[1].trim().toUpperCase();
  const line = parseInt(m[2], 10);
  const row = parseInt(m[3], 10);
  if (!zoneCode || !Number.isFinite(line) || !Number.isFinite(row)) return null;
  if (line < 1 || row < 1) return null;
  return { zoneCode, line, row };
}
