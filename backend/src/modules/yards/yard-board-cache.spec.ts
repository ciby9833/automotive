import { YardBoardCache } from './yard-board-cache';
import type { SlotView } from './yards.service';
const slot = (id: string, currentVin: string | null = null) =>
  ({ id, currentVin }) as SlotView;
describe('incremental yard board reads', () => {
  it('returns only changed slots after the first snapshot, including multiple missed versions and deletions', async () => {
    const cache = new YardBoardCache();
    let slots = [slot('a'), slot('b'), slot('c')];
    const read = async () => ({ slots, stats: { total: slots.length } });
    const first = await cache.get('yard', read);
    expect(first.full).toBe(true);
    expect(first.slots).toHaveLength(3);
    slots = [slot('a', 'VIN'), slot('b'), slot('c')];
    cache.invalidate();
    const second = await cache.get('yard', read, first.version);
    expect(second.full).toBe(false);
    expect(second.slots).toEqual([slot('a', 'VIN')]);
    slots = [slot('a', 'VIN'), slot('c'), slot('d')];
    cache.invalidate();
    const third = await cache.get('yard', read, first.version);
    expect(third.slots).toEqual([slot('a', 'VIN'), slot('d')]);
    expect(third.removedSlotIds).toEqual(['b']);
    const unchanged = await cache.get('yard', read, third.version);
    expect(unchanged.slots).toEqual([]);
    expect(unchanged.removedSlotIds).toEqual([]);
  });
  it('falls back to full data for an expired cursor, a restart or another backend process', async () => {
    const cache = new YardBoardCache();
    const read = async () => ({ slots: [slot('a')], stats: { total: 1 } });
    expect((await cache.get('yard', read, 'unknown')).full).toBe(true);
    const first = await cache.get('yard', read);
    cache.reset();
    const changed = await cache.get(
      'yard',
      async () => ({ slots: [slot('b')], stats: { total: 1 } }),
      first.version,
    );
    expect(changed.full).toBe(true);
    expect(changed.slots).toEqual([slot('b')]);
  });
  it('does not retain unbounded delta history', async () => {
    const cache = new YardBoardCache();
    const first = await cache.get('yard', async () => ({
      slots: [slot('a')],
      stats: { total: 1 },
    }));
    for (let i = 0; i < 40; i++) {
      cache.invalidate();
      await cache.get('yard', async () => ({
        slots: [slot('a', String(i))],
        stats: { total: 1 },
      }));
    }
    const response = await cache.get(
      'yard',
      async () => {
        throw new Error('cached');
      },
      first.version,
    );
    expect(response.full).toBe(true);
    expect(response.slots).toEqual([slot('a', '39')]);
  });
  it('keeps a 10000-slot yard response small when one vehicle changes position', async () => {
    const cache = new YardBoardCache();
    let slots = Array.from({ length: 10000 }, (_, i) => slot(String(i)));
    const read = async () => ({ slots, stats: { total: slots.length } });
    const full = await cache.get('yard', read);
    slots = [slot('0', 'VIN'), ...slots.slice(1)];
    cache.invalidate();
    const delta = await cache.get('yard', read, full.version);
    expect(delta.slots).toHaveLength(1);
    expect(
      JSON.stringify(delta).length / JSON.stringify(full).length,
    ).toBeLessThan(0.01);
  });
  it.each(['invalidate', 'reset'] as const)(
    'does not let an older read overwrite history after %s',
    async (action) => {
      const cache = new YardBoardCache();
      const board = (vin: string) => ({
        slots: [slot('a', vin)],
        stats: { total: 1 },
      });
      const first = await cache.get('yard', async () => board('first'));
      cache.invalidate();
      let finish!: (value: ReturnType<typeof board>) => void;
      const slow = cache.get(
        'yard',
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      await Promise.resolve();
      cache[action]();
      const newer = await cache.get(
        'yard',
        async () => board('newer'),
        first.version,
      );
      finish(board('old'));
      const stale = await slow;
      cache.invalidate();
      const latest = await cache.get(
        'yard',
        async () => board('latest'),
        newer.version,
      );
      expect(latest.full).toBe(false);
      expect(latest.slots).toEqual([slot('a', 'latest')]);
      if (action === 'reset') {
        expect(
          (await cache.get('yard', async () => board('latest'), first.version))
            .full,
        ).toBe(true);
      }
      expect(
        (await cache.get('yard', async () => board('latest'), stale.version))
          .full,
      ).toBe(true);
    },
  );
});
