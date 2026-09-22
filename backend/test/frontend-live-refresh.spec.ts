import { createRefreshQueue } from '../../frontend/src/lib/live/refresh-queue';

describe('live operational refresh scheduling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('does not poll by itself when nothing changes', async () => {
    const read = jest.fn(async () => {});
    const queue = createRefreshQueue(read);
    queue.refresh();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(read).toHaveBeenCalledTimes(1);
    queue.dispose();
  });
  it('merges 100 notifications into one read', async () => {
    const read = jest.fn(async () => {});
    const queue = createRefreshQueue(read);
    for (let i = 0; i < 100; i++) queue.refresh();
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) queue.refresh();
    await jest.advanceTimersByTimeAsync(1999);
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    queue.dispose();
  });
  it('never overlaps a slow request and preserves an invalidation received during it', async () => {
    let finish!: () => void;
    const read = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const queue = createRefreshQueue(read);
    queue.refresh();
    await jest.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 20; i++) queue.refresh();
    await jest.advanceTimersByTimeAsync(30000);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    finish();
    queue.dispose();
  });
  it('aborts the old request and stops pending reads when a page becomes hidden or changes scope', async () => {
    let signal!: AbortSignal;
    let finish!: () => void;
    const read = jest.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const queue = createRefreshQueue(read);
    queue.refresh();
    await jest.advanceTimersByTimeAsync(0);
    queue.refresh();
    queue.dispose();
    expect(signal.aborted).toBe(true);
    finish();
    queue.refresh();
    await jest.advanceTimersByTimeAsync(3600000);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('can refresh again after a failed request', async () => {
    const read = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const queue = createRefreshQueue(read);
    queue.refresh();
    await jest.advanceTimersByTimeAsync(0);
    queue.refresh();
    await jest.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(2);
    queue.dispose();
  });
});

import { applyBoardUpdate } from '../../frontend/src/lib/live/yard-board-snapshot';
import type {
  YardBoardData,
  YardBoardResponse,
  YardSlot,
  YardStats,
} from '../../frontend/src/lib/api/yards';
describe('applying incremental board data', () => {
  const a = {
    id: 'a',
    zoneCode: 'A',
    line: 1,
    row: 1,
    currentVin: null,
  } as YardSlot;
  const b = { ...a, id: 'b', row: 2 };
  const initial: YardBoardData = {
    version: 'one',
    slots: [a, b],
    stats: {} as YardStats,
  };
  it('merges a changed slot, removes deleted slots and replaces totals', () => {
    const result = applyBoardUpdate(initial, {
      version: 'two',
      baseVersion: 'one',
      full: false,
      slots: [{ ...a, currentVin: 'VIN' }],
      removedSlotIds: ['b'],
      stats: { total: 1 } as YardStats,
    });
    expect(result.slots).toEqual([{ ...a, currentVin: 'VIN' }]);
    expect(result.stats.total).toBe(1);
    expect(initial.slots).toHaveLength(2);
  });
  it('retains the slot array for unchanged data and rejects a mismatched delta', () => {
    const update: YardBoardResponse = {
      version: 'one',
      baseVersion: 'one',
      full: false,
      slots: [],
      removedSlotIds: [],
      stats: initial.stats,
    };
    expect(applyBoardUpdate(initial, update).slots).toBe(initial.slots);
    expect(() =>
      applyBoardUpdate({ ...initial, version: 'different' }, update),
    ).toThrow('Invalid board version');
  });
  it('replaces stale data with a full snapshot after cursor expiry', () => {
    const next = applyBoardUpdate(initial, {
      version: 'new',
      full: true,
      baseVersion: null,
      slots: [b],
      removedSlotIds: [],
      stats: initial.stats,
    });
    expect(next.slots).toEqual([b]);
  });
});
