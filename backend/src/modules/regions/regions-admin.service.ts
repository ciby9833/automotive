import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import type { EffectiveScope } from '../../common/scope/scope.types';
import { REGION_COUNTRIES } from '../../database/data/admin-regions';
import type { CreateRegionDto, UpdateRegionDto } from './regions.dto';
import type { RegionRow } from './regions.service';

/**
 * 行政区划维护：总部可以维护所有国家；机构管理员只能维护自己机构所在国家。
 * 区划最多两级（省/州 → 县/市）；自定义区域可以独立存在，也可以挂在某个一级区域下。
 * 删除前检查下级、门店和报价引用，被用着的不能删。
 */
@Injectable()
export class RegionsAdminService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async countries(scope: EffectiveScope): Promise<string[]> {
    if (scope.type !== 'ORG') throw new ForbiddenException();
    if (scope.role === Role.HQ_ADMIN) return [...REGION_COUNTRIES];
    const rows = await this.db.query<{ country_code: string }[]>(
      `SELECT DISTINCT country_code FROM organizations WHERE id = ANY($1::uuid[]) AND country_code IS NOT NULL ORDER BY 1`,
      [scope.orgIds],
    );
    return rows.map((r) => r.country_code);
  }

  async list(scope: EffectiveScope, country: string) {
    await this.requireCountry(scope, country);
    return this.db.query<
      (RegionRow & {
        child_count: number;
        address_count: number;
        tariff_count: number;
      })[]
    >(
      `SELECT r.id, r.country_code, r.code, r.name, r.type, r.parent_id, r.is_system,
         (SELECT count(*)::int FROM regions c WHERE c.parent_id = r.id) child_count,
         (SELECT count(*)::int FROM customer_addresses a WHERE a.region_id = r.id) address_count,
         (SELECT count(*)::int FROM transport_tariffs t WHERE t.destination_region_id = r.id) tariff_count
       FROM regions r WHERE r.country_code = $1
       ORDER BY r.is_system DESC, r.code`,
      [country],
    );
  }

  async create(scope: EffectiveScope, d: CreateRegionDto) {
    await this.requireCountry(scope, d.country);
    const name = d.name.trim();
    const parent = d.parentId
      ? await this.requireParent(d.parentId, d.country)
      : null;
    const code = d.code?.trim().toUpperCase() || this.autoCode(name, d.custom);
    await this.assertUnique(d.country, code, name, parent?.id ?? null);
    const type = d.custom ? 'CUSTOM' : parent ? 'ADMIN_2' : 'ADMIN_1';
    const [row] = await this.db.query<RegionRow[]>(
      `INSERT INTO regions(country_code, code, name, type, parent_id, is_system) VALUES ($1,$2,$3,$4,$5,false) RETURNING *`,
      [d.country, code, name, type, parent?.id ?? null],
    );
    return row;
  }

  async update(scope: EffectiveScope, id: string, d: UpdateRegionDto) {
    const region = await this.get(id);
    await this.requireCountry(scope, region.country_code);
    const name = d.name?.trim() || region.name;
    // 标准区划的代码和层级来自官方数据，只允许改名；自定义 / 手工新增的可以改代码和上级
    let code = region.code;
    let parentId = region.parent_id;
    if (!region.is_system) {
      if (d.code !== undefined) code = d.code?.trim().toUpperCase() || code;
      if (d.parentId !== undefined) {
        if (d.parentId) {
          if (d.parentId === id)
            throw new BadRequestException('上级不能是自己');
          const [{ n }] = await this.db.query<{ n: number }[]>(
            'SELECT count(*)::int n FROM regions WHERE parent_id = $1',
            [id],
          );
          if (n)
            throw new BadRequestException(
              '该区域下还有下级区域，不能再挂到别的区域下（最多两级）',
            );
          parentId = (await this.requireParent(d.parentId, region.country_code))
            .id;
        } else parentId = null;
      }
    }
    await this.assertUnique(region.country_code, code, name, parentId, id);
    return this.db.transaction(async (m) => {
      const [rows] = await m.query<[RegionRow[], number]>(
        `UPDATE regions SET name = $1, code = $2, parent_id = $3, updated_at = now() WHERE id = $4 RETURNING *`,
        [name, code, parentId, id],
      );
      // 地址上冗余的区域名称跟着改，老运单 / 出库页面直接显示它
      if (name !== region.name)
        await m.query(
          'UPDATE customer_addresses SET region = $1 WHERE region_id = $2',
          [name, id],
        );
      return rows[0];
    });
  }

  async remove(scope: EffectiveScope, id: string) {
    const region = await this.get(id);
    await this.requireCountry(scope, region.country_code);
    const [use] = await this.db.query<
      { children: number; addresses: number; tariffs: number }[]
    >(
      `SELECT (SELECT count(*)::int FROM regions WHERE parent_id = $1) children,
              (SELECT count(*)::int FROM customer_addresses WHERE region_id = $1) addresses,
              (SELECT count(*)::int FROM transport_tariffs WHERE destination_region_id = $1) tariffs`,
      [id],
    );
    const used = [
      use.children && `${use.children} 个下级区域`,
      use.addresses && `${use.addresses} 个客户地点`,
      use.tariffs && `${use.tariffs} 条运输报价`,
    ].filter(Boolean);
    if (used.length)
      throw new BadRequestException(
        `「${region.name}」还在使用中：${used.join('、')}，请先调整后再删除`,
      );
    await this.db.query('DELETE FROM regions WHERE id = $1', [id]);
    return { ok: true };
  }

  private async requireCountry(scope: EffectiveScope, country: string) {
    if (!(await this.countries(scope)).includes(country))
      throw new ForbiddenException('只能维护自己机构所在国家的行政区划');
  }

  private async get(id: string): Promise<RegionRow> {
    const [row] = await this.db.query<RegionRow[]>(
      'SELECT * FROM regions WHERE id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('区域不存在');
    return row;
  }

  /** 上级只能是同一国家的一级区域（区划最多两级） */
  private async requireParent(id: string, country: string): Promise<RegionRow> {
    const parent = await this.get(id);
    if (parent.country_code !== country)
      throw new BadRequestException('上级区域不属于该国家');
    if (parent.parent_id)
      throw new BadRequestException(
        '上级只能选一级区域（省 / 州），区划最多两级',
      );
    return parent;
  }

  private async assertUnique(
    country: string,
    code: string,
    name: string,
    parentId: string | null,
    exceptId?: string,
  ) {
    const [hit] = await this.db.query<{ code: string; name: string }[]>(
      `SELECT code, name FROM regions
       WHERE country_code = $1 AND id IS DISTINCT FROM $5
         AND (upper(code) = upper($2) OR (lower(name) = lower($3) AND parent_id IS NOT DISTINCT FROM $4))
       LIMIT 1`,
      [country, code, name, parentId, exceptId ?? null],
    );
    if (hit)
      throw new ConflictException(
        hit.code.toUpperCase() === code.toUpperCase()
          ? `代码 ${code} 已被「${hit.name}」使用`
          : `同一上级下已有「${hit.name}」`,
      );
  }

  private autoCode(name: string, custom: boolean) {
    const slug = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    return `${custom ? 'CUSTOM' : 'U'}-${slug || randomUUID().slice(0, 6).toUpperCase()}`;
  }
}
