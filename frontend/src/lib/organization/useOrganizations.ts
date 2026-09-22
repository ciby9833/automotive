"use client";

import { useEffect, useState } from "react";
import { organizationsApi, Organization } from "@/lib/api/organizations";
import { useAuthStore } from "@/lib/auth/store";

export function refreshOrganizations() {
  window.dispatchEvent(new Event("organizations-updated"));
}

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      organizationsApi
        .list()
        .then((rows) => {
          if (!cancelled) setOrganizations(rows);
        })
        .catch(() => {
          if (!cancelled) setOrganizations([]);
        });
    void load();
    window.addEventListener("organizations-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("organizations-updated", load);
    };
  }, [activeOrgId]);
  return organizations;
}
