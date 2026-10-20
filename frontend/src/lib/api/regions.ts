import { apiClient, unwrap } from './client';

/** 各国标准行政区划；机构所在国家决定可选范围 */
export interface Region {
  id: string;
  country_code: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_system: boolean;
}

/** 维护页用：带引用数量，用来判断能不能删 */
export interface ManagedRegion extends Region {
  child_count: number;
  address_count: number;
  tariff_count: number;
}

export interface RegionInput {
  country: string;
  name: string;
  code?: string;
  parentId?: string;
  custom: boolean;
}

export const regionsApi = {
  list: (organizationId: string) =>
    unwrap<{ country: string | null; items: Region[] }>(
      apiClient.get('/regions', { params: { organizationId } }),
    ),
  manageCountries: () => unwrap<string[]>(apiClient.get('/regions/manage/countries')),
  manageList: (country: string) =>
    unwrap<ManagedRegion[]>(apiClient.get('/regions/manage', { params: { country } })),
  create: (d: RegionInput) => unwrap<Region>(apiClient.post('/regions', d)),
  update: (id: string, d: { name?: string; code?: string; parentId?: string | null }) =>
    unwrap<Region>(apiClient.patch(`/regions/${id}`, d)),
  remove: (id: string) => unwrap<{ ok: boolean }>(apiClient.delete(`/regions/${id}`)),
};
