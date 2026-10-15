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

export const regionsApi = {
  list: (organizationId: string) =>
    unwrap<{ country: string | null; items: Region[] }>(
      apiClient.get('/regions', { params: { organizationId } }),
    ),
};
