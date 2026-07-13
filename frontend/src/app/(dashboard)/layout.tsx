'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/store';
import { AppShell } from '@/components/layout/AppShell';

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (hasHydrated && !token) {
      router.replace('/login');
    }
  }, [hasHydrated, token, router]);

  // hasHydrated 为 false 时说明还没读完 localStorage，先不渲染也不跳转，避免刷新页面闪回登录页
  if (!hasHydrated || !token || !user) return null;

  return <AppShell>{children}</AppShell>;
}
