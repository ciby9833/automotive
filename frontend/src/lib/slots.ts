export type SlotCoordinates = {
  zoneCode?: string | null;
  zone?: { code?: string | null } | null;
  line: number;
  row: number;
};

export function formatSlotCode(slot: SlotCoordinates): string {
  const zoneCode = slot.zoneCode ?? slot.zone?.code;
  if (!zoneCode) return '—';
  return `${zoneCode}-${String(slot.line).padStart(2, '0')}-${String(slot.row).padStart(2, '0')}`;
}
