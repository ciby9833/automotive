import { ReadCache } from './read-cache';
describe('shared operational reads', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('coalesces concurrent readers of the same yard but isolates other keys', async () => {
    const cache = new ReadCache<number>();
    const read = jest.fn(async () => 1);
    expect(
      await Promise.all(
        Array.from({ length: 100 }, () => cache.get('yard-a', read)),
      ),
    ).toEqual(Array(100).fill(1));
    expect(read).toHaveBeenCalledTimes(1);
    await cache.get('yard-b', read);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('expires entries and invalidates reads after changes', async () => {
    const cache = new ReadCache<number>();
    let version = 1;
    const read = jest.fn(async () => version);
    expect(await cache.get('yard', read)).toBe(1);
    version = 2;
    cache.clear();
    expect(await cache.get('yard', read)).toBe(2);
    version = 3;
    await jest.advanceTimersByTimeAsync(2001);
    expect(await cache.get('yard', read)).toBe(3);
  });
  it('does not repopulate invalidated entries with an older in-flight response', async () => {
    const cache = new ReadCache<number>();
    let finish!: (v: number) => void;
    const old = cache.get(
      'yard',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cache.clear();
    expect(await cache.get('yard', async () => 2)).toBe(2);
    finish(1);
    await old;
    expect(await cache.get('yard', async () => 3)).toBe(2);
  });
  it('does not retain failed reads or grow without a bound', async () => {
    const cache = new ReadCache<number>();
    await expect(
      cache.get('failed', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow();
    expect(await cache.get('failed', async () => 1)).toBe(1);
    for (let i = 0; i < 40; i++) await cache.get(String(i), async () => i);
    const read = jest.fn(async () => 99);
    expect(await cache.get('0', read)).toBe(99);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('shares a query that takes longer than the result TTL and caches its completed result', async () => {
    const cache = new ReadCache<number>();
    let finish!: (v: number) => void;
    const read = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const first = cache.get('yard', read);
    await jest.advanceTimersByTimeAsync(5000);
    const second = cache.get('yard', read);
    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    finish(1);
    await first;
    await jest.advanceTimersByTimeAsync(1999);
    expect(await cache.get('yard', async () => 2)).toBe(1);
  });
});
