import { createHash } from 'node:crypto';
import { ReadCache } from '../operational-updates/read-cache';
import type { SlotView } from './yards.service';

type Board = { slots: SlotView[]; stats: Record<string, number | null> };
type Delta = {
  baseVersion: string;
  version: string;
  slots: SlotView[];
  removedSlotIds: string[];
};
type Snapshot = { version: string; data: Board; history: Delta[] };

// Read optimization only. If a cursor is unknown/evicted/on another process, send a full
// snapshot. Business writes never depend on this cache and no inventory facts live here.
export class YardBoardCache {
  private readonly reads = new ReadCache<Snapshot>();
  private readonly snapshots = new Map<string, Snapshot>();
  invalidate = () => this.reads.clear();
  reset = () => {
    this.reads.clear();
    this.snapshots.clear();
  };

  async get(yardId: string, load: () => Promise<Board>, since?: string) {
    const current = await this.reads.get(yardId, async (isCurrent) => {
      const data = await load();
      const version = createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
      const previous = this.snapshots.get(yardId);
      if (previous?.version === version) return previous;
      const before = new Map(previous?.data.slots.map((s) => [s.id, s]) ?? []);
      const changed = data.slots.filter(
        (s) => JSON.stringify(before.get(s.id)) !== JSON.stringify(s),
      );
      const present = new Set(data.slots.map((s) => s.id));
      const removed =
        previous?.data.slots
          .filter((s) => !present.has(s.id))
          .map((s) => s.id) ?? [];
      const history = previous
        ? [
            ...previous.history,
            {
              baseVersion: previous.version,
              version,
              slots: changed,
              removedSlotIds: removed,
            },
          ]
        : [];
      let retained = history.reduce(
        (n, d) => n + d.slots.length + d.removedSlotIds.length,
        0,
      );
      while (history.length > 32 || retained > 10000) {
        const old = history.shift()!;
        retained -= old.slots.length + old.removedSlotIds.length;
      }
      const snapshot = { version, data, history };
      // An invalidated/evicted read may finish after a newer snapshot or a reset.
      // It can answer its original caller, but must never republish stale history.
      if (!isCurrent()) return snapshot;
      this.snapshots.delete(yardId);
      if (this.snapshots.size >= 32)
        this.snapshots.delete(this.snapshots.keys().next().value!);
      this.snapshots.set(yardId, snapshot);
      return snapshot;
    });
    const base = { version: current.version, stats: current.data.stats };
    if (since === current.version)
      return {
        ...base,
        full: false,
        baseVersion: since,
        slots: [],
        removedSlotIds: [],
      };
    const start = current.history.findIndex((d) => d.baseVersion === since);
    if (start < 0)
      return {
        ...base,
        full: true,
        baseVersion: null,
        slots: current.data.slots,
        removedSlotIds: [],
      };
    const slots = new Map<string, SlotView>();
    const removed = new Set<string>();
    for (const delta of current.history.slice(start)) {
      for (const s of delta.slots) {
        slots.set(s.id, s);
        removed.delete(s.id);
      }
      for (const id of delta.removedSlotIds) {
        slots.delete(id);
        removed.add(id);
      }
    }
    return {
      ...base,
      full: false,
      baseVersion: since!,
      slots: [...slots.values()],
      removedSlotIds: [...removed],
    };
  }
}
