import { YardSlot, YardSlotStatus } from './entities/yard-slot.entity';
import { YardZone } from './entities/yard-zone.entity';
export function yardCapacity(
  slots: YardSlot[],
  zones: YardZone[],
  yardIsActive = true,
) {
  const enabled = slots.filter((s) => yardIsActive && s.zone.isActive);
  const usable = enabled.filter((s) => !s.isLocked);
  return {
    designCapacity: zones.reduce((sum, z) => sum + z.lineCount * z.rowCount, 0),
    enabledCapacity: enabled.length,
    availableCapacity: usable.filter((s) => s.status === YardSlotStatus.VACANT)
      .length,
    frozenCapacity: enabled.filter((s) => s.isLocked).length,
    disabledCapacity: slots.length - enabled.length,
    ungeneratedCapacity:
      zones.reduce((sum, z) => sum + z.lineCount * z.rowCount, 0) -
      slots.length,
    usableCapacity: usable.length,
    occupiedUsable: usable.filter((s) => s.status === YardSlotStatus.OCCUPIED)
      .length,
    parkingCapacity: usable.filter((s) => s.zone.purpose === 'PARKING').length,
    stagingCapacity: usable.filter((s) => s.zone.purpose === 'STAGING').length,
  };
}
