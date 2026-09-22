import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Actor, TransportAccess } from './transport.access';
import {
  AdjustChargeDto,
  ChargeIdsDto,
  RecalculateDto,
  TariffDto,
} from './transport.dto';
import { AddressRow, ChargeRow, LineRow, TariffRow, TripRow } from './transport.rows';
import { datesOverlap, parseTowType } from './transport.rules';

type Side = 'RECEIVABLE' | 'PAYABLE';

/**
 * 纯运输报价与费用。与旧 finance_records（强绑定场地运单、账单邮件）分开存放，互不影响。
 * - 应收：客户 + 发货地 + 门店 + 拖车类型
 * - 应付：客户 + 物流商 + 发货地 + 门店（优先）或目的区域 + 拖车类型
 * 币种取客户所属机构默认币种；报价按生效期间匹配，匹配不到记 0 元（UNPRICED），可手工调整、可重算。
 */
@Injectable()
export class TransportFinanceService {
  constructor(private readonly access: TransportAccess) {}

  private get db() {
    return this.access.db;
  }

  // ------------------------------------------------------------------ 报价
  async tariffs(
    a: Actor,
    q: { side?: string; customerId?: string; carrierId?: string; originId?: string; activeOn?: string },
  ) {
    this.access.requireInternal(a);
    const args: unknown[] = [a.orgIds];
    const where = ['t.organization_id = ANY($1::uuid[])'];
    const eq: [string | undefined, string][] = [
      [q.side, 't.side'],
      [q.customerId, 't.customer_id'],
      [q.carrierId, 't.carrier_id'],
      [q.originId, 't.origin_id'],
    ];
    for (const [value, col] of eq) {
      if (!value) continue;
      args.push(value);
      where.push(`${col} = $${args.length}`);
    }
    if (q.activeOn) {
      args.push(q.activeOn);
      where.push(`t.valid_from <= $${args.length} AND (t.valid_to IS NULL OR t.valid_to >= $${args.length})`);
    }
    return this.db.query(
      `SELECT t.*, t.valid_from::text valid_from, t.valid_to::text valid_to, c.name customer_name, cr.name carrier_name,
         oa.code origin_code, oa."dealerName" origin_name,
         da.code destination_code, da."dealerName" destination_name
       FROM transport_tariffs t
       JOIN customers c ON c.id = t.customer_id
       LEFT JOIN carriers cr ON cr.id = t.carrier_id
       JOIN customer_addresses oa ON oa.id = t.origin_id
       LEFT JOIN customer_addresses da ON da.id = t.destination_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.side, c.name, oa.code, da.code NULLS LAST, t.destination_region, t.tow_type, t.valid_from DESC`,
      args,
    );
  }

  async saveTariff(a: Actor, d: TariffDto, id?: string) {
    this.access.requireInternal(a);
    return this.access.tx(async (m) => {
      const [customer] = await m.query<{ id: string; organization_id: string }[]>(
        'SELECT id, organization_id FROM customers WHERE id = $1',
        [d.customerId],
      );
      if (!customer) throw new NotFoundException('客户不存在');
      this.access.requireOrg(a, customer.organization_id);
      const towType = parseTowType(d.towType)!;
      const ids = [d.originId, d.destinationId].filter(Boolean) as string[];
      const addresses = await m.query<AddressRow[]>(
        `SELECT id, customer_id, code, "dealerName", region, kind, "isActive" FROM customer_addresses WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      if (addresses.length !== ids.length || addresses.some((x) => x.customer_id !== customer.id))
        throw new BadRequestException('发货地和门店必须是该客户已维护的地点');
      const region = d.destinationRegion?.trim() || null;
      let carrierId: string | null = null;
      if (d.side === 'RECEIVABLE') {
        if (!d.destinationId) throw new BadRequestException('应收报价必须指定收货门店');
        if (region || d.carrierId) throw new BadRequestException('应收报价不区分物流商和区域');
      } else {
        if (!d.carrierId) throw new BadRequestException('应付报价必须指定物流商');
        if (!!d.destinationId === !!region)
          throw new BadRequestException('应付报价请指定收货门店或目的区域（二选一）');
        const [carrier] = await m.query<{ organization_id: string }[]>(
          'SELECT organization_id FROM carriers WHERE id = $1',
          [d.carrierId],
        );
        if (!carrier || !a.orgIds.includes(carrier.organization_id))
          throw new BadRequestException('物流商不存在或不在当前机构');
        carrierId = d.carrierId;
      }
      const validTo = d.validTo || null;
      if (validTo && validTo < d.validFrom) throw new BadRequestException('结束日期早于开始日期');
      // 同一维度的报价生效期间不能重叠，否则无法确定用哪一条
      const same = await m.query<TariffRow[]>(
        `SELECT id, valid_from::text valid_from, valid_to::text valid_to FROM transport_tariffs
         WHERE side = $1 AND customer_id = $2 AND carrier_id IS NOT DISTINCT FROM $3 AND origin_id = $4
           AND destination_id IS NOT DISTINCT FROM $5 AND destination_region IS NOT DISTINCT FROM $6
           AND tow_type = $7 AND id IS DISTINCT FROM $8
         FOR UPDATE`,
        [d.side, customer.id, carrierId, d.originId, d.destinationId ?? null, region, towType, id ?? null],
      );
      const clash = same.find((t) => datesOverlap(t.valid_from, t.valid_to, d.validFrom, validTo));
      if (clash)
        throw new ConflictException(
          `与已有报价（${clash.valid_from} ~ ${clash.valid_to ?? '长期'}）生效期间重叠，请先调整结束日期`,
        );
      const [org] = await m.query<{ defaultCurrency: string }[]>(
        'SELECT "defaultCurrency" FROM organizations WHERE id = $1',
        [customer.organization_id],
      );
      const values = [
        customer.organization_id,
        d.side,
        customer.id,
        carrierId,
        d.originId,
        d.destinationId ?? null,
        region,
        towType,
        d.price,
        org.defaultCurrency,
        d.validFrom,
        validTo,
        d.remark?.trim() ?? '',
      ];
      if (id) {
        const [saved] = await this.access.rows<TariffRow>(
          m,
          `UPDATE transport_tariffs SET organization_id=$1, side=$2, customer_id=$3, carrier_id=$4, origin_id=$5,
             destination_id=$6, destination_region=$7, tow_type=$8, price=$9, currency=$10, valid_from=$11,
             valid_to=$12, remark=$13, updated_at=now()
           WHERE id = $14 AND organization_id = ANY($15::uuid[])
           RETURNING *, valid_from::text valid_from, valid_to::text valid_to`,
          [...values, id, a.orgIds],
        );
        if (!saved) throw new NotFoundException('报价不存在');
        return saved;
      }
      const [saved] = await m.query<TariffRow[]>(
        `INSERT INTO transport_tariffs(organization_id, side, customer_id, carrier_id, origin_id, destination_id,
           destination_region, tow_type, price, currency, valid_from, valid_to, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *, valid_from::text valid_from, valid_to::text valid_to`,
        [...values, a.user.userId],
      );
      return saved;
    });
  }

  async deleteTariff(a: Actor, id: string) {
    this.access.requireInternal(a);
    const rows = await this.access.rows<{ id: string }>(
      this.db.manager,
      'DELETE FROM transport_tariffs WHERE id = $1 AND organization_id = ANY($2::uuid[]) RETURNING id',
      [id, a.orgIds],
    );
    if (!rows.length) throw new NotFoundException('报价不存在');
    return { ok: true };
  }

  // ------------------------------------------------------------------ 计价
  private async price(
    m: EntityManager,
    side: Side,
    line: LineRow,
    trip: TripRow,
    serviceDate: string,
  ): Promise<{ tariffId: string | null; amount: string; pricing: 'TARIFF' | 'UNPRICED' }> {
    const args: unknown[] = [side, line.customer_id, line.origin_id, trip.tow_type, serviceDate];
    let sql = `SELECT id, price FROM transport_tariffs
      WHERE side = $1 AND customer_id = $2 AND origin_id = $3 AND tow_type = $4
        AND valid_from <= $5 AND (valid_to IS NULL OR valid_to >= $5)`;
    if (side === 'RECEIVABLE') {
      args.push(line.destination_id);
      sql += ` AND destination_id = $6 ORDER BY valid_from DESC LIMIT 1`;
    } else {
      args.push(trip.carrier_id, line.destination_id);
      sql += ` AND carrier_id = $6 AND (destination_id = $7 OR (destination_id IS NULL AND destination_region =
        (SELECT region FROM customer_addresses WHERE id = $7)))
        ORDER BY (destination_id IS NOT NULL) DESC, valid_from DESC LIMIT 1`;
    }
    const [tariff] = await m.query<{ id: string; price: string }[]>(sql, args);
    return tariff
      ? { tariffId: tariff.id, amount: tariff.price, pricing: 'TARIFF' }
      : { tariffId: null, amount: '0', pricing: 'UNPRICED' };
  }

  /** 签收后生成该车的应收、应付各一条；重复签收不重复生成。 */
  async createChargesForLine(m: EntityManager, line: LineRow, trip: TripRow) {
    const [meta] = await m.query<{ currency: string; service_date: string }[]>(
      `SELECT o."defaultCurrency" currency, CURRENT_DATE::text service_date FROM organizations o WHERE o.id = $1`,
      [line.organization_id],
    );
    for (const side of ['RECEIVABLE', 'PAYABLE'] as Side[]) {
      const p = await this.price(m, side, line, trip, meta.service_date);
      await m.query(
        `INSERT INTO transport_charges(organization_id, line_id, trip_id, side, customer_id, carrier_id, tariff_id,
           amount, currency, pricing, service_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (line_id, side) DO NOTHING`,
        [
          line.organization_id,
          line.id,
          trip.id,
          side,
          line.customer_id,
          side === 'PAYABLE' ? trip.carrier_id : null,
          p.tariffId,
          p.amount,
          meta.currency,
          p.pricing,
          meta.service_date,
        ],
      );
    }
  }

  /** 报价调整后重算未确认的费用；默认不覆盖手工调整过的金额。 */
  async recalculate(a: Actor, d: RecalculateDto) {
    this.access.requireInternal(a);
    return this.access.tx(async (m) => {
      const args: unknown[] = [a.orgIds];
      const where = [`ch.organization_id = ANY($1::uuid[])`, `ch.status = 'PENDING'`];
      if (!d.includeManual) where.push(`ch.pricing <> 'MANUAL'`);
      if (d.from) {
        args.push(d.from);
        where.push(`ch.service_date >= $${args.length}`);
      }
      if (d.to) {
        args.push(d.to);
        where.push(`ch.service_date <= $${args.length}`);
      }
      if (d.customerId) {
        args.push(d.customerId);
        where.push(`ch.customer_id = $${args.length}`);
      }
      const charges = await m.query<ChargeRow[]>(
        `SELECT ch.*, ch.service_date::text service_date FROM transport_charges ch WHERE ${where.join(' AND ')} ORDER BY ch.id FOR UPDATE`,
        args,
      );
      let updated = 0;
      for (const ch of charges) {
        const [line] = await m.query<LineRow[]>('SELECT * FROM transport_lines WHERE id = $1', [ch.line_id]);
        const [trip] = await m.query<TripRow[]>('SELECT * FROM transport_trips WHERE id = $1', [ch.trip_id]);
        const p = await this.price(m, ch.side, line, trip, ch.service_date);
        if (Number(p.amount) === Number(ch.amount) && p.pricing === ch.pricing && p.tariffId === ch.tariff_id)
          continue;
        await m.query(
          `UPDATE transport_charges SET amount = $1, pricing = $2, tariff_id = $3, manual_reason = NULL,
             updated_by = $4, updated_at = now() WHERE id = $5`,
          [p.amount, p.pricing, p.tariffId, a.user.userId, ch.id],
        );
        await this.access.event(m, a, {
          organizationId: ch.organization_id,
          tripId: ch.trip_id,
          lineId: ch.line_id,
          vin: line.vin,
          action: 'CHARGE_RECALCULATED',
          payload: { side: ch.side, from: ch.amount, to: p.amount, pricing: p.pricing },
        });
        updated += 1;
      }
      return { checked: charges.length, updated };
    });
  }

  // ------------------------------------------------------------------ 费用
  async charges(
    a: Actor,
    q: {
      side?: string;
      customerId?: string;
      carrierId?: string;
      tripId?: string;
      vin?: string;
      status?: string;
      pricing?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    },
  ) {
    this.access.requireInternal(a);
    const args: unknown[] = [a.orgIds];
    const where = ['ch.organization_id = ANY($1::uuid[])'];
    const eq: [string | undefined, string][] = [
      [q.side, 'ch.side'],
      [q.customerId, 'ch.customer_id'],
      [q.carrierId, 'ch.carrier_id'],
      [q.tripId, 'ch.trip_id'],
      [q.status, 'ch.status'],
      [q.pricing, 'ch.pricing'],
    ];
    for (const [value, col] of eq) {
      if (!value) continue;
      args.push(value);
      where.push(`${col} = $${args.length}`);
    }
    if (q.vin?.trim()) {
      args.push(`%${q.vin.trim().toUpperCase()}%`);
      where.push(`l.vin ILIKE $${args.length}`);
    }
    if (q.from) {
      args.push(q.from);
      where.push(`ch.service_date >= $${args.length}`);
    }
    if (q.to) {
      args.push(q.to);
      where.push(`ch.service_date <= $${args.length}`);
    }
    const from = `FROM transport_charges ch
      JOIN transport_lines l ON l.id = ch.line_id
      JOIN transport_trips t ON t.id = ch.trip_id
      JOIN transport_orders o ON o.id = l.order_id
      JOIN customers c ON c.id = ch.customer_id
      LEFT JOIN carriers cr ON cr.id = COALESCE(ch.carrier_id, t.carrier_id)
      JOIN customer_addresses oa ON oa.id = l.origin_id
      JOIN customer_addresses da ON da.id = l.destination_id
      WHERE ${where.join(' AND ')}`;
    const totals = await this.db.query(
      `SELECT ch.side, ch.currency, sum(ch.amount)::text amount, count(*)::int count,
         count(*) FILTER (WHERE ch.pricing = 'UNPRICED')::int unpriced
       ${from} GROUP BY ch.side, ch.currency ORDER BY ch.side`,
      args,
    );
    const [{ total }] = await this.db.query<{ total: number }[]>(`SELECT count(*)::int total ${from}`, args);
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const items = await this.db.query(
      `SELECT ch.*, ch.service_date::text service_date, l.vin, l.tow_type, t.code trip_code, o.code order_code, c.name customer_name, cr.name carrier_name,
         oa.code origin_code, oa."dealerName" origin_name, da.code destination_code, da."dealerName" destination_name,
         da.region destination_region
       ${from}
       ORDER BY ch.service_date DESC, t.code, l.vin, ch.side
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, total, totals };
  }

  async adjust(a: Actor, id: string, d: AdjustChargeDto) {
    this.access.requireInternal(a);
    const reason = d.reason.trim();
    if (!reason) throw new BadRequestException('请填写调整原因');
    return this.access.tx(async (m) => {
      const [ch] = await m.query<(ChargeRow & { vin: string })[]>(
        `SELECT ch.*, l.vin FROM transport_charges ch JOIN transport_lines l ON l.id = ch.line_id
         WHERE ch.id = $1 FOR UPDATE OF ch`,
        [id],
      );
      if (!ch) throw new NotFoundException('费用不存在');
      this.access.requireOrg(a, ch.organization_id);
      if (ch.status !== 'PENDING') throw new BadRequestException('已确认的费用不能再调整');
      const [saved] = await this.access.rows<ChargeRow>(
        m,
        `UPDATE transport_charges SET amount = $1, pricing = 'MANUAL', manual_reason = $2, updated_by = $3,
           updated_at = now() WHERE id = $4 RETURNING *, service_date::text service_date`,
        [d.amount, reason, a.user.userId, id],
      );
      await this.access.event(m, a, {
        organizationId: ch.organization_id,
        tripId: ch.trip_id,
        lineId: ch.line_id,
        vin: ch.vin,
        action: 'CHARGE_ADJUSTED',
        reason,
        payload: { side: ch.side, from: ch.amount, to: d.amount },
      });
      return saved;
    });
  }

  async confirm(a: Actor, d: ChargeIdsDto) {
    this.access.requireInternal(a);
    const rows = await this.access.rows<{ id: string }>(
      this.db.manager,
      `UPDATE transport_charges SET status = 'CONFIRMED', updated_by = $1, updated_at = now()
       WHERE id = ANY($2::uuid[]) AND status = 'PENDING' AND organization_id = ANY($3::uuid[]) RETURNING id`,
      [a.user.userId, d.ids, a.orgIds],
    );
    return { confirmed: rows.length };
  }
}
