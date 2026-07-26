'use client';

import { useEffect } from 'react';

// ChunkLoadError 自动 reload：Next.js build 后新旧 chunk hash 会失配，
// 已经加载的 HTML 引用老 hash 文件，部署后老 hash 不存在→ChunkLoadError→白页。
//
// 部署脚本 (deploy/upgrade-frontend.sh) 已经用"保留老 static 30 天"缓解，
// 这里是二重保险：真发生 chunk 加载失败时，静默 reload 拿新 HTML。
//
// 只在一次 session 内 reload 一次，避免死循环（网络本身有问题时 reload 也拿不到）。
const RELOADED_KEY = '__chunk_error_reloaded__';

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string }).name;
  const message = (err as { message?: string }).message ?? '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Loading CSS chunk [\w-]+ failed/i.test(message) ||
    // Next 15+ 的运行时错误也会带这个词
    /Failed to fetch dynamically imported module/i.test(message)
  );
}

function reloadOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    // sessionStorage 不可用（隐私模式等）时直接 reload 也 OK
  }
  // 用 replace 避免历史栈里留个坏页
  window.location.reload();
}

export function ChunkErrorReloader(): null {
  useEffect(() => {
    const onError = (evt: ErrorEvent) => {
      if (isChunkLoadError(evt.error) || isChunkLoadError({ message: evt.message })) {
        reloadOnce();
      }
    };
    const onRejection = (evt: PromiseRejectionEvent) => {
      if (isChunkLoadError(evt.reason)) {
        reloadOnce();
      }
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
