"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { AppShell } from "@/components/layout/AppShell";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const mode = useAuthStore((s) => s.mode);

  useEffect(() => {
    if (hasHydrated && !token) {
      router.replace("/login");
    } else if (hasHydrated && mode === "NEEDS_SELECTION") {
      router.replace("/select-org");
    }
  }, [hasHydrated, token, mode, router]);

  // hasHydrated 为 false 时说明还没读完 localStorage，先不渲染也不跳转，避免刷新页面闪回登录页
  if (!hasHydrated || !token || !user || mode === "NEEDS_SELECTION")
    return null;

  return <AppShell>{children}</AppShell>;
}
