// One read at a time. Bursts collapse into one trailing read; dispose aborts stale work.
export function createRefreshQueue(
  read: (signal: AbortSignal) => Promise<void>,
  minInterval = 2000,
) {
  let stopped = false,
    running = false,
    dirty = false,
    lastStart = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const schedule = () => {
    if (stopped || running || timer || !dirty) return;
    const delay = Math.max(0, lastStart + minInterval - Date.now());
    timer = setTimeout(() => {
      timer = undefined;
      void run().catch(() => undefined);
    }, delay);
  };
  const run = async () => {
    if (stopped || running) return;
    dirty = false;
    running = true;
    lastStart = Date.now();
    controller = new AbortController();
    try {
      await read(controller.signal);
    } finally {
      running = false;
      schedule();
    }
  };
  return {
    refresh() {
      if (stopped) return;
      dirty = true;
      schedule();
    },
    dispose() {
      stopped = true;
      dirty = false;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
