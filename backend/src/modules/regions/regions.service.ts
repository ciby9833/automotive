import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export interface RegionRow {
  id: string;
  country_code: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_system: boolean;
}

// 常见简称 → 标准代码（Excel、线下表里经常这么写）
const ALIASES: Record<string, Record<string, string>> = {
  ID: {
    'DKI JAKARTA': '31',
    JAKARTA: '31',
    'DAERAH KHUSUS JAKARTA': '31',
    DIY: '34',
    YOGYAKARTA: '34',
  },
  TH: { BANGKOK: 'TH-10', PATTAYA: 'TH-S' },
  MY: {
    KL: 'MY-14',
    'KUALA LUMPUR': 'MY-14',
    PUTRAJAYA: 'MY-16',
    LABUAN: 'MY-15',
  },
  PH: { NCR: 'PH-00', 'METRO MANILA': 'PH-00' },
  VN: {
    HCMC: 'VN-SG',
    'HO CHI MINH CITY': 'VN-SG',
    SAIGON: 'VN-SG',
    HANOI: 'VN-HN',
    HUE: 'VN-26',
  },
};
// 名称前缀不参与比较：“Kota Bekasi”“Bekasi”都能认，但重名（Kota/Kabupaten Bekasi）要求写全称
const PREFIXES = [
  'kota administrasi ',
  'kabupaten administrasi ',
  'kabupaten ',
  'kab. ',
  'kab ',
  'kota ',
  'provinsi ',
  'wilayah persekutuan ',
];

/** 去重音、转小写、合并空格，越南语名称不带声调也能匹配 */
export function normalizeRegionName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPrefix(s: string): string {
  const p = PREFIXES.find((x) => s.startsWith(x));
  return p ? s.slice(p.length) : s;
}

/** 全机构共用的各国行政区划；机构通过 organizations.country_code 决定用哪个国家的区域。 */
@Injectable()
export class RegionsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async countryOf(
    organizationId: string,
    m: EntityManager = this.db.manager,
  ): Promise<string | null> {
    const [org] = await m.query<{ country_code: string | null }[]>(
      'SELECT country_code FROM organizations WHERE id = $1',
      [organizationId],
    );
    return org?.country_code ?? null;
  }

  list(
    country: string,
    m: EntityManager = this.db.manager,
  ): Promise<RegionRow[]> {
    return m.query<RegionRow[]>(
      `SELECT id, country_code, code, name, type, parent_id, is_system FROM regions
       WHERE country_code = $1 AND is_active ORDER BY is_system DESC, code`,
      [country],
    );
  }

  async get(
    id: string,
    m: EntityManager = this.db.manager,
  ): Promise<RegionRow | null> {
    const [row] = await m.query<RegionRow[]>(
      'SELECT id, country_code, code, name, type, parent_id, is_system FROM regions WHERE id = $1 AND is_active',
      [id],
    );
    return row ?? null;
  }

  /** 按 id 取区域并校验属于该国 */
  async requireInCountry(
    id: string,
    country: string | null,
    m?: EntityManager,
  ): Promise<RegionRow> {
    const region = await this.get(id, m);
    if (!region || region.country_code !== country)
      throw new BadRequestException('区域不存在，或不属于该机构所在国家');
    return region;
  }

  /**
   * 把 Excel/表单里填的区域文字对到标准区域：代码、全称、常见简称、去掉 Kota/Kabupaten 等前缀后的名称。
   * 返回 null 表示没对上；重名时抛错让用户写全称。
   */
  resolveIn(
    regions: RegionRow[],
    country: string,
    text: string,
  ): RegionRow | null {
    const raw = text.trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const alias = ALIASES[country]?.[normalizeRegionName(raw).toUpperCase()];
    const byCode = regions.find(
      (r) => r.code.toUpperCase() === upper || (alias && r.code === alias),
    );
    if (byCode) return byCode;
    const key = normalizeRegionName(raw);
    const exact = regions.filter((r) => normalizeRegionName(r.name) === key);
    if (exact.length === 1) return exact[0];
    const loose = regions.filter(
      (r) => stripPrefix(normalizeRegionName(r.name)) === stripPrefix(key),
    );
    if (loose.length === 1) return loose[0];
    if (loose.length > 1 || exact.length > 1)
      throw new BadRequestException(
        `区域「${raw}」有重名：${(loose.length ? loose : exact).map((r) => r.name).join(' / ')}，请填写全称或代码`,
      );
    return null;
  }
}
