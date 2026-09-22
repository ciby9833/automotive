import { JSDOM } from 'jsdom';

const mockSockets: Array<{
  on: Function;
  disconnect: jest.Mock;
  fire: (name: string) => void;
}> = [];
jest.mock('../../frontend/node_modules/next/navigation', () => ({
  usePathname: () => '/yards',
}));
jest.mock('../../frontend/node_modules/socket.io-client', () => ({
  io: () => {
    const listeners = new Map<string, () => void>();
    const socket = {
      on: (name: string, listener: () => void) => {
        listeners.set(name, listener);
      },
      disconnect: jest.fn(),
      fire: (name: string) => listeners.get(name)?.(),
    };
    mockSockets.push(socket);
    return socket;
  },
}));
jest.mock('../../frontend/src/lib/api/client', () => ({
  apiClient: { defaults: { baseURL: 'http://localhost:3001' } },
}));

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
let visibility = 'visible';
Object.defineProperty(document, 'visibilityState', {
  get: () => visibility,
  configurable: true,
});
const React =
  require('../../frontend/node_modules/react') as typeof import('react');
const { createRoot } =
  require('../../frontend/node_modules/react-dom/client') as typeof import('react-dom/client');
const { useLiveYardData } =
  require('../../frontend/src/lib/live/use-live-yard-data') as typeof import('../../frontend/src/lib/live/use-live-yard-data');
const { useLayoutStore } =
  require('../../frontend/src/components/layout/layoutStore') as typeof import('../../frontend/src/components/layout/layoutStore');
const { useAuthStore } =
  require('../../frontend/src/lib/auth/store') as typeof import('../../frontend/src/lib/auth/store');

describe('mounted workspace visibility and live data hook (React + DOM)', () => {
  let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
  const Probe = ({
    read,
    yardId = 'yard',
  }: {
    read: (signal: AbortSignal) => Promise<{ value: string }>;
    yardId?: string;
  }) => {
    const result = useLiveYardData({
      pagePath: '/yards',
      view: 'board',
      yardId,
      read,
    });
    return React.createElement('span', null, result.data?.value ?? 'empty');
  };
  const advance = async (ms: number) =>
    React.act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  beforeEach(() => {
    jest.useFakeTimers();
    mockSockets.length = 0;
    visibility = 'visible';
    useAuthStore.setState({ token: 'test-token' });
    useLayoutStore.setState({ activeTabPath: '/yards' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await React.act(async () => root.unmount());
    container.remove();
    jest.useRealTimers();
  });
  afterAll(() => dom.window.close());
  it('stops requests and disconnects when a cached workspace page is hidden, then resyncs on return', async () => {
    const read = jest.fn(async () => ({ value: 'fresh' }));
    await React.act(async () =>
      root.render(React.createElement(Probe, { read })),
    );
    await React.act(async () => mockSockets[0].fire('connect'));
    await advance(0);
    expect(read).toHaveBeenCalledTimes(1);
    await React.act(async () =>
      useLayoutStore.setState({ activeTabPath: '/outbound/departure' }),
    );
    expect(mockSockets[0].disconnect).toHaveBeenCalledTimes(1);
    await advance(3600000);
    expect(read).toHaveBeenCalledTimes(1);
    await React.act(async () =>
      useLayoutStore.setState({ activeTabPath: '/yards' }),
    );
    await React.act(async () => mockSockets[1].fire('connect'));
    await advance(0);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not connect or fetch for a background browser document', async () => {
    visibility = 'hidden';
    const read = jest.fn(async () => ({ value: 'fresh' }));
    await React.act(async () =>
      root.render(React.createElement(Probe, { read })),
    );
    await advance(600000);
    expect(mockSockets).toHaveLength(0);
    expect(read).not.toHaveBeenCalled();
    await React.act(async () => {
      visibility = 'visible';
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
    });
    await React.act(async () => mockSockets[0].fire('connect'));
    await advance(0);
    expect(read).toHaveBeenCalledTimes(1);
    await React.act(async () => {
      visibility = 'hidden';
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
    });
    await advance(600000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(mockSockets[0].disconnect).toHaveBeenCalledTimes(1);
  });
  it('aborts the old yard request and never lets its late response overwrite the new yard', async () => {
    let complete!: (value: { value: string }) => void;
    let oldSignal!: AbortSignal;
    const read = jest
      .fn()
      .mockImplementationOnce((signal: AbortSignal) => {
        oldSignal = signal;
        return new Promise((resolve) => {
          complete = resolve;
        });
      })
      .mockResolvedValue({ value: 'new yard' });
    await React.act(async () =>
      root.render(React.createElement(Probe, { read, yardId: 'old' })),
    );
    await React.act(async () => mockSockets[0].fire('connect'));
    await advance(0);
    await React.act(async () =>
      root.render(React.createElement(Probe, { read, yardId: 'new' })),
    );
    expect(oldSignal.aborted).toBe(true);
    await React.act(async () => mockSockets[1].fire('connect'));
    await advance(0);
    expect(container.textContent).toBe('new yard');
    await React.act(async () => complete({ value: 'stale yard' }));
    expect(container.textContent).toBe('new yard');
  });
  it('fetches on notifications and reconnection, with no 30-second polling', async () => {
    const read = jest.fn(async () => ({ value: 'fresh' }));
    await React.act(async () =>
      root.render(React.createElement(Probe, { read })),
    );
    await React.act(async () => mockSockets[0].fire('connect'));
    await advance(0);
    await advance(60000);
    expect(read).toHaveBeenCalledTimes(1);
    await React.act(async () => {
      for (let i = 0; i < 100; i++) mockSockets[0].fire('changed');
    });
    await advance(0);
    expect(read).toHaveBeenCalledTimes(2);
    await React.act(async () => mockSockets[0].fire('connect'));
    await advance(2000);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
