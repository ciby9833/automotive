import { MigrationInterface, QueryRunner } from 'typeorm';
import { ADMIN_REGIONS } from '../data/admin-regions';

/**
 * 10-14 业务确认：
 * 1. 区域改为全机构共用的各国标准行政区划（regions），门店挂 region_id；
 *    运输报价应收、应付都支持「门店」或「区域」，查价门店优先，区域（含上级区域）兜底。
 *    旧的自由文本区域：能对上标准名称/代码的直接挂上；对不上的（如 GREATER JAKARTA）建成该国的自定义区域，原报价照常生效。
 *    customer_addresses.region 保留为区域名称（由后端随 region_id 写入），老运单/出库的显示不用改。
 * 2. 拖车类型新增 DD（Double Drop，默认载量 3），老出库/运单与纯运输都可用。
 */
export class RegionsAndDoubleDrop1790600000000 implements MigrationInterface {
  name = 'RegionsAndDoubleDrop1790600000000';

  async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ 区域
    await q.query(`CREATE TABLE regions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      country_code varchar(2) NOT NULL,
      code varchar(40) NOT NULL,
      name varchar(150) NOT NULL,
      type varchar(30) NOT NULL,
      parent_id uuid REFERENCES regions(id) ON DELETE RESTRICT,
      is_system boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT regions_country_code_unique UNIQUE (country_code, code)
    )`);
    await q.query(`CREATE INDEX regions_parent ON regions(parent_id)`);
    await q.query(`CREATE INDEX regions_country_name ON regions(country_code, lower(name))`);

    // 先全部插入，再按上级代码关联（同一条 INSERT 里看不到本条语句刚插入的上级）
    for (let i = 0; i < ADMIN_REGIONS.length; i += 200) {
      const chunk = ADMIN_REGIONS.slice(i, i + 200);
      const args = chunk.flatMap(([country, code, name, type]) => [country, code, name, type]);
      const values = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`);
      await q.query(`INSERT INTO regions(country_code, code, name, type) VALUES ${values.join(',')}`, args);
    }
    const children = ADMIN_REGIONS.filter((r) => r[4]);
    for (let i = 0; i < children.length; i += 200) {
      const chunk = children.slice(i, i + 200);
      const args = chunk.flatMap(([country, code, , , parent]) => [country, code, parent]);
      const values = chunk.map((_, j) => `($${j * 3 + 1}::varchar, $${j * 3 + 2}::varchar, $${j * 3 + 3}::varchar)`);
      await q.query(
        `UPDATE regions c SET parent_id = p.id
         FROM (VALUES ${values.join(',')}) v(country, code, parent)
         JOIN regions p ON p.country_code = v.country AND p.code = v.parent
         WHERE c.country_code = v.country AND c.code = v.code`,
        args,
      );
    }

    // 机构所属国家：国家节点的机构代码就是 ISO 国家码；其他机构（总部、测试机构）在机构管理里手动设置
    await q.query(`ALTER TABLE organizations ADD COLUMN country_code varchar(2)`);
    await q.query(
      `UPDATE organizations SET country_code = code WHERE code IN (SELECT DISTINCT country_code FROM regions)`,
    );

    // 旧文本区域 → 区域表；对不上标准区划的建成该国自定义区域
    await q.query(`CREATE TEMP TABLE legacy_region(country_code varchar(2), label varchar)`);
    await q.query(`INSERT INTO legacy_region
      SELECT DISTINCT o.country_code, btrim(a.region)
      FROM customer_addresses a JOIN customers c ON c.id = a.customer_id JOIN organizations o ON o.id = c.organization_id
      WHERE o.country_code IS NOT NULL AND btrim(coalesce(a.region, '')) <> ''
      UNION
      SELECT DISTINCT o.country_code, btrim(t.destination_region)
      FROM transport_tariffs t JOIN customers c ON c.id = t.customer_id JOIN organizations o ON o.id = c.organization_id
      WHERE o.country_code IS NOT NULL AND btrim(coalesce(t.destination_region, '')) <> ''`);
    await q.query(`INSERT INTO regions(country_code, code, name, type, is_system)
      SELECT l.country_code, 'CUSTOM-' || upper(regexp_replace(l.label, '[^A-Za-z0-9]+', '-', 'g')), upper(l.label), 'CUSTOM', false
      FROM legacy_region l
      WHERE NOT EXISTS (
        SELECT 1 FROM regions r WHERE r.country_code = l.country_code
          AND (lower(r.name) = lower(l.label) OR upper(r.code) = upper(l.label)))
      ON CONFLICT (country_code, code) DO NOTHING`);
    await q.query(`DROP TABLE legacy_region`);

    const match = (label: string) => `(SELECT r.id FROM regions r WHERE r.country_code = o.country_code
        AND (lower(r.name) = lower(btrim(${label})) OR upper(r.code) = upper(btrim(${label}))
          OR r.code = 'CUSTOM-' || upper(regexp_replace(btrim(${label}), '[^A-Za-z0-9]+', '-', 'g')))
        ORDER BY r.is_system DESC LIMIT 1)`;

    await q.query(
      `ALTER TABLE customer_addresses ADD COLUMN region_id uuid REFERENCES regions(id) ON DELETE SET NULL`,
    );
    await q.query(`CREATE INDEX customer_addresses_region ON customer_addresses(region_id)`);
    await q.query(`UPDATE customer_addresses a SET region_id = ${match('a.region')}
      FROM customers c JOIN organizations o ON o.id = c.organization_id
      WHERE c.id = a.customer_id AND o.country_code IS NOT NULL AND btrim(coalesce(a.region, '')) <> ''`);
    await q.query(`UPDATE customer_addresses a SET region = r.name FROM regions r WHERE r.id = a.region_id`);

    // 报价：文本区域 → region_id；应收也允许按区域
    await q.query(
      `ALTER TABLE transport_tariffs ADD COLUMN destination_region_id uuid REFERENCES regions(id) ON DELETE RESTRICT`,
    );
    await q.query(`UPDATE transport_tariffs t SET destination_region_id = ${match('t.destination_region')}
      FROM customers c JOIN organizations o ON o.id = c.organization_id
      WHERE c.id = t.customer_id AND btrim(coalesce(t.destination_region, '')) <> ''`);
    const [{ lost }] = await q.query(
      `SELECT count(*)::int lost FROM transport_tariffs WHERE destination_region IS NOT NULL AND destination_region_id IS NULL`,
    );
    if (lost)
      throw new Error(`${lost} 条按区域的运输报价对应的机构没有设置国家，无法迁移区域；请先给机构设置国家代码`);
    // 旧的“应收必须门店 / 应付门店或区域”约束：按内容找，不依赖自动生成的约束名
    await this.dropChecks(q, 'transport_tariffs', 'destination_region');
    await q.query(`ALTER TABLE transport_tariffs DROP COLUMN destination_region`);
    await q.query(`ALTER TABLE transport_tariffs ADD CONSTRAINT transport_tariffs_destination_check
      CHECK ((destination_id IS NOT NULL) <> (destination_region_id IS NOT NULL))`);
    await q.query(`ALTER TABLE transport_tariffs ADD CONSTRAINT transport_tariffs_carrier_check
      CHECK ((side = 'RECEIVABLE' AND carrier_id IS NULL) OR (side = 'PAYABLE' AND carrier_id IS NOT NULL))`);
    await q.query(`CREATE INDEX transport_tariffs_region ON transport_tariffs(destination_region_id)`);

    // ------------------------------------------------------------ DD
    // 枚举类型名各环境不一定一样（生产 order_vins.tow_type 复用 waybills_towtype_enum，
    // 部分开发库是单独的 order_vins_tow_type_enum），按“表 + 字段”查实际类型，同一类型只加一次
    const enums = await q.query(
      `SELECT DISTINCT format('%I.%I', n.nspname, t.typname) AS type
       FROM (VALUES ('carrier_vehicles', 'towType'), ('waybills', 'towType'), ('order_vins', 'tow_type')) v(tbl, col)
       JOIN pg_class c ON c.relname = v.tbl
       JOIN pg_namespace cn ON cn.oid = c.relnamespace AND cn.nspname = current_schema()
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = v.col AND NOT a.attisdropped
       JOIN pg_type t ON t.oid = a.atttypid AND t.typtype = 'e'
       JOIN pg_namespace n ON n.oid = t.typnamespace`,
    );
    for (const { type } of enums as { type: string }[])
      await q.query(`ALTER TYPE ${type} ADD VALUE IF NOT EXISTS 'DD'`);
    for (const table of ['transport_trips', 'transport_lines', 'transport_tariffs']) {
      await this.dropChecks(q, table, 'TANSYA');
      await q.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_tow_type_check
        CHECK (tow_type IN ('CC','TANSYA','DD','TOWING'))`);
    }
  }

  /** 删除表上定义里包含某段文字的 CHECK 约束（约束名由 Postgres 自动生成，各环境不保证一致） */
  private async dropChecks(q: QueryRunner, table: string, needle: string) {
    const rows = await q.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = $1::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE $2`,
      [table, `%${needle}%`],
    );
    for (const { conname } of rows as { conname: string }[])
      await q.query(`ALTER TABLE ${table} DROP CONSTRAINT "${conname}"`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Postgres 不能从枚举里删值；DD 留在枚举里，只收紧纯运输的约束（已有 DD 数据时会失败，需先处理）
    for (const table of ['transport_trips', 'transport_lines', 'transport_tariffs']) {
      await this.dropChecks(q, table, 'TANSYA');
      await q.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_tow_type_check
        CHECK (tow_type IN ('CC','TANSYA','TOWING'))`);
    }
    await q.query(`ALTER TABLE transport_tariffs ADD COLUMN destination_region varchar`);
    await q.query(`UPDATE transport_tariffs t SET destination_region = r.name FROM regions r WHERE r.id = t.destination_region_id`);
    await q.query(`ALTER TABLE transport_tariffs DROP CONSTRAINT transport_tariffs_destination_check`);
    await q.query(`ALTER TABLE transport_tariffs DROP CONSTRAINT transport_tariffs_carrier_check`);
    await q.query(`ALTER TABLE transport_tariffs DROP COLUMN destination_region_id`);
    await q.query(`ALTER TABLE transport_tariffs ADD CONSTRAINT transport_tariffs_check1
      CHECK (side = 'PAYABLE' OR (carrier_id IS NULL AND destination_id IS NOT NULL AND destination_region IS NULL))`);
    await q.query(`ALTER TABLE transport_tariffs ADD CONSTRAINT transport_tariffs_check2
      CHECK (side = 'RECEIVABLE' OR (carrier_id IS NOT NULL AND ((destination_id IS NOT NULL) <> (destination_region IS NOT NULL))))`);
    await q.query(`ALTER TABLE customer_addresses DROP COLUMN region_id`);
    await q.query(`ALTER TABLE organizations DROP COLUMN country_code`);
    await q.query(`DROP TABLE regions`);
  }
}
