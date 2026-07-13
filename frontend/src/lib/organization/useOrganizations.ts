'use client';

import { useEffect, useState } from 'react';
import { organizationsApi, Organization } from '@/lib/api/organizations';

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  useEffect(() => {
    organizationsApi.list().then(setOrganizations).catch(() => undefined);
  }, []);
  return organizations;
}
