import type { YardBoardData, YardBoardResponse } from '@/lib/api/yards';

export function applyBoardUpdate(
  previous: YardBoardData | null,
  update: YardBoardResponse,
): YardBoardData {
  if (update.full)
    return {
      version: update.version,
      stats: update.stats,
      slots: update.slots,
    };
  if (!previous || update.baseVersion !== previous.version)
    throw new Error('Invalid board version');
  if (!update.slots.length && !update.removedSlotIds.length)
    return { ...previous, version: update.version, stats: update.stats };
  const slots = new Map(previous.slots.map((s) => [s.id, s]));
  for (const s of update.slots) slots.set(s.id, s);
  for (const id of update.removedSlotIds) slots.delete(id);
  return {
    version: update.version,
    stats: update.stats,
    slots: [...slots.values()].sort(
      (a, b) =>
        a.zoneCode.localeCompare(b.zoneCode) ||
        a.line - b.line ||
        a.row - b.row,
    ),
  };
}
