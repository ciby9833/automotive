'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';
import { io } from 'socket.io-client';
import { useAuthStore } from '@/lib/auth/store';
import { useLayoutStore } from '@/components/layout/layoutStore';
import { apiClient } from '@/lib/api/client';
import { createRefreshQueue } from './refresh-queue';

const subscribeVisibility = (changed: () => void) => {
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
};
const isVisible = () => document.visibilityState === 'visible';

// Cached workspace pages stay mounted. Visibility requires BOTH an active workspace tab
// and a foreground browser document; hidden pages keep their data but do no refresh work.
export function useVisiblePage(pagePath: string) {
  const pathname = usePathname();
  const activeTab = useLayoutStore((s) => s.activeTabPath);
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    () => false,
  );
  return visible && (activeTab ?? pathname).split('?')[0] === pagePath;
}

export function useLiveYardData<T>({
  pagePath,
  view,
  yardId,
  organizationId,
  enabled = true,
  read,
}: {
  pagePath: string;
  view: 'board' | 'dashboard';
  yardId?: string | null;
  organizationId?: string;
  enabled?: boolean;
  read: (signal: AbortSignal) => Promise<T>;
}) {
  const active = useVisiblePage(pagePath);
  const token = useAuthStore((s) => s.token);
  const key = JSON.stringify([token, view, yardId, organizationId]);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    loading: boolean;
    error: unknown;
    updatedAt: number;
  }>({ key: '', data: null, loading: false, error: null, updatedAt: 0 });
  const queueRef = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  const refresh = useCallback(() => queueRef.current?.refresh(), []);

  useEffect(() => {
    if (!active || !enabled || !token) return;
    const queue = createRefreshQueue(async (signal) => {
      setState((previous) => ({
        key,
        data: previous.key === key ? previous.data : null,
        loading: previous.key !== key || !previous.data,
        error: null,
        updatedAt: previous.updatedAt,
      }));
      try {
        const data = await read(signal);
        if (!signal.aborted)
          setState({
            key,
            data,
            loading: false,
            error: null,
            updatedAt: Date.now(),
          });
      } catch (error) {
        if (!signal.aborted)
          setState((previous) => ({ ...previous, key, loading: false, error }));
      }
    });
    queueRef.current = queue;
    const endpoint = new URL(
      apiClient.defaults.baseURL ?? '/',
      window.location.origin,
    );
    const socket = io(`${endpoint.origin}/operational-updates`, {
      transports: ['websocket'],
      auth: { token, view, yardId, organizationId },
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });
    // Subscribe before the initial read. If WebSocket is unavailable, HTTP still works.
    const initial = setTimeout(() => queue.refresh(), 750);
    socket.on('connect', () => {
      clearTimeout(initial);
      queue.refresh();
    });
    socket.on('changed', () => queue.refresh());
    const online = () => queue.refresh();
    window.addEventListener('online', online);
    // Notifications aren't a durable stream. Low-frequency, jittered resync also updates
    // clock-derived alerts/day boundaries and covers proxies that block WebSockets.
    const fallback = setInterval(
      () => queue.refresh(),
      270000 + Math.random() * 60000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(fallback);
      window.removeEventListener('online', online);
      socket.disconnect();
      queue.dispose();
      if (queueRef.current === queue) queueRef.current = null;
    };
  }, [active, enabled, token, key, view, yardId, organizationId, read]);

  const matches = state.key === key;
  return {
    active,
    refresh,
    updatedAt: state.updatedAt,
    data: matches ? state.data : null,
    loading: enabled && (!matches || state.loading),
    error: matches ? state.error : null,
  };
}
