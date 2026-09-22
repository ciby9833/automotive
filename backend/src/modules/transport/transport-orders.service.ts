import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Actor, TransportAccess } from './transport.access';
import {
  AllocateLinesDto,
  CancelLinesDto,
  CreateTransportOrderDto,
  ImportTransportDto,
  SupplementVinsDto,
  UpdateLineDto,
} from './transport.dto';
import { AddressRow, LineRow, OrderRow } from './transport.rows';
import {
  TowType,
  deriveOrderStatus,
  normalizeTransportVin,
  parseTowType,
  transportCode,
} from './transport.rules';

interface NewLine {
  vin: string | null;
  originId: string;
  destinationId: string;
  vehicleConfig: string;
  vehicleModel: string;
  vehicleColor: string;
  towType: TowType | null;
  carrierId: string | null;
}
interface NewOrder {
  customerRequestNo: string;
  plannedPickupDate: string | null;
  plannedDeliveryDate: string | null;
  remark: string;
  lines: NewLine[];
}
export interface ImportRowError {
  row: number;
  message: string;
}

const MAX_LINES_PER_ORDER = 2000;
const EDITABLE_BEFORE_PICKUP = ['UNALLOCATED', 'ALLOCATED', 'DISPATCHED'];

@Injectable()
export class TransportOrdersService {
  constructor(private readonly access: TransportAccess) {}

  private get db() {
    return this.access.db;
  }

  // ------------------------------------------------------------------ 查询
  async list(
    a: Actor,
    q: { search?: string; status?: string; customerId?: string; page: number; pageSize: number },
  ) {
    const args: unknown[] = [];
    const where = [this.access.orderFilter(a, 'o', args)];
    if (q.status) {
      args.push(q.status);
      where.push(`o.status = $${args.length}`);
    }
    if (q.customerId) {
      args.push(q.customerId);
      where.push(`o.customer_id = $${args.length}`);
    }
    if (q.search?.trim()) {
      args.push(`%${q.search.trim()}%`);
      const p = `$${args.length}`;
      where.push(
        `(o.code ILIKE ${p} OR o.customer_request_no ILIKE ${p} OR EXISTS (SELECT 1 FROM transport_lines sl WHERE sl.order_id = o.id AND sl.vin ILIKE ${p}))`,
      );
    }
    const filter = where.join(' AND ');
    const [{ total }] = await this.db.query<{ total: number }[]>(
      `SELECT count(*)::int total FROM transport_orders o WHERE ${filter}`,
      args,
    );
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const items = await this.db.query(
      `SELECT o.*, o.planned_pickup_date::text planned_pickup_date, o.planned_delivery_date::text planned_delivery_date, c.name customer_name,
         count(l.id) FILTER (WHERE l.status <> 'CANCELLED')::int line_count,
         count(l.id) FILTER (WHERE l.status = 'DELIVERED')::int delivered_count,
         count(l.id) FILTER (WHERE l.status IN ('PICKED_UP','IN_TRANSIT'))::int moving_count,
         count(l.id) FILTER (WHERE l.status = 'UNALLOCATED')::int unallocated_count,
         count(l.id) FILTER (WHERE l.vin IS NULL AND l.status <> 'CANCELLED')::int missing_vin_count
       FROM transport_orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN transport_lines l ON l.order_id = o.id
       WHERE ${filter}
       GROUP BY o.id, c.name
       ORDER BY o.created_at DESC
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, total };
  }

  async detail(a: Actor, id: string) {
    const args: unknown[] = [id];
    const filter = this.access.orderFilter(a, 'o', args);
    const [order] = await this.db.query<(OrderRow & { customer_name: string })[]>(
      `SELECT o.*, o.planned_pickup_date::text planned_pickup_date, o.planned_delivery_date::text planned_delivery_date, c.name customer_name FROM transport_orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND ${filter}`,
      args,
    );
    if (!order) throw new NotFoundException('运输需求单不存在');
    const lines = await this.db.query(
      `${LINE_SELECT} WHERE l.order_id = $1 ORDER BY l.line_no`,
      [id],
    );
    const events = a.internal
      ? await this.db.query(
          `SELECT e.id, e.action, e.vin, e.reason, e.payload, e.created_at, u."displayName" operator_name
           FROM transport_events e JOIN users u ON u.id = e.operator_id
           WHERE e.order_id = $1 ORDER BY e.created_at DESC LIMIT 500`,
          [id],
        )
      : [];
    // 本单车辆所在各段的 POD（客户只能看到自己车辆所在段的回单）
    const documents = await this.db.query(
      `SELECT DISTINCT d.id, d.trip_id, t.code trip_code, d.origin_id, d.destination_id, d.file_key, d.file_name, d.mime_type, d.created_at
       FROM transport_documents d
       JOIN transport_trips t ON t.id = d.trip_id
       JOIN transport_lines l ON l.trip_id = d.trip_id AND l.origin_id = d.origin_id AND l.destination_id = d.destination_id
       WHERE l.order_id = $1
       ORDER BY d.created_at`,
      [id],
    );
    return { order, lines, events, documents };
  }

  async lines(
    a: Actor,
    q: {
      status?: string;
      orderId?: string;
      customerId?: string;
      carrierId?: string;
      originId?: string;
      destinationId?: string;
      towType?: string;
      search?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const args: unknown[] = [];
    const where = [this.access.lineFilter(a, 'l', args)];
    if (q.status) {
      args.push(q.status.split(',').map((s) => s.trim()).filter(Boolean));
      where.push(`l.status = ANY($${args.length}::varchar[])`);
    }
    const eq: [string | undefined, string][] = [
      [q.orderId, 'l.order_id'],
      [q.customerId, 'l.customer_id'],
      [q.carrierId, 'l.carrier_id'],
      [q.originId, 'l.origin_id'],
      [q.destinationId, 'l.destination_id'],
      [q.towType, 'l.tow_type'],
    ];
    for (const [value, col] of eq) {
      if (!value) continue;
      args.push(value);
      where.push(`${col} = $${args.length}`);
    }
    if (q.search?.trim()) {
      args.push(`%${q.search.trim()}%`);
      const p = `$${args.length}`;
      where.push(`(l.vin ILIKE ${p} OR o.code ILIKE ${p} OR o.customer_request_no ILIKE ${p})`);
    }
    const filter = where.join(' AND ');
    const [{ total }] = await this.db.query<{ total: number }[]>(
      `SELECT count(*)::int total FROM transport_lines l JOIN transport_orders o ON o.id = l.order_id WHERE ${filter}`,
      args,
    );
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const items = await this.db.query(
      `${LINE_SELECT} WHERE ${filter}
       ORDER BY o.planned_pickup_date NULLS LAST, o.created_at, l.line_no
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, total };
  }

  async vinHistory(a: Actor, rawVin: string) {
    this.access.requireInternal(a);
    const vin = normalizeTransportVin(rawVin);
    const lines = await this.db.query(
      `${LINE_SELECT} WHERE l.vin = $1 AND l.organization_id = ANY($2::uuid[]) ORDER BY l.created_at DESC`,
      [vin, a.orgIds],
    );
    const events = await this.db.query(
      `SELECT e.id, e.action, e.reason, e.payload, e.created_at, e.order_id, e.trip_id, u."displayName" operator_name
       FROM transport_events e JOIN users u ON u.id = e.operator_id
       WHERE e.vin = $1 AND e.organization_id = ANY($2::uuid[]) ORDER BY e.created_at DESC LIMIT 500`,
      [vin, a.orgIds],
    );
    return { vin, lines, events };
  }

  // ------------------------------------------------------------------ 建单
  async create(a: Actor, d: CreateTransportOrderDto) {
    this.access.requireInternal(a);
    const customer = await this.customer(a, d.customerId);
    const lines: NewLine[] = [];
    for (const input of d.lines) {
      const vin = input.vin?.trim() ? normalizeTransportVin(input.vin) : null;
      const quantity = vin ? 1 : (input.quantity ?? 1);
      if (vin && input.quantity && input.quantity !== 1)
        throw new BadRequestException('填写了 VIN 的行数量只能是 1');
      const towType = parseTowType(input.towType);
      if (input.carrierId && !towType)
        throw new BadRequestException('指定物流商时必须同时指定拖车类型');
      for (let i = 0; i < quantity; i += 1)
        lines.push({
          vin,
          originId: input.originId,
          destinationId: input.destinationId,
          vehicleConfig: input.vehicleConfig?.trim() ?? '',
          vehicleModel: input.vehicleModel?.trim() ?? '',
          vehicleColor: input.vehicleColor?.trim() ?? '',
          towType,
          carrierId: input.carrierId ?? null,
        });
    }
    const order: NewOrder = {
      customerRequestNo: d.customerRequestNo.trim(),
      plannedPickupDate: d.plannedPickupDate || null,
      plannedDeliveryDate: d.plannedDeliveryDate || null,
      remark: d.remark?.trim() ?? '',
      lines,
    };
    const errors = await this.validate(this.db.manager, a, customer, [
      { order, rows: lines.map(() => 0) },
    ]);
    if (errors.length) throw new BadRequestException(errors.map((e) => e.message).join('；'));
    return this.access.tx(async (m) => {
      const [created] = await this.insert(m, a, customer, [order], 'MANUAL');
      return created;
    });
  }

  /**
   * Excel 导入：先 dryRun 预览，逐行返回错误；确认后整个文件一个事务落库。
   * 同一 CustomerRequestNo 合并为一张需求单；Quantity 行展开为 N 条空 VIN 明细。
   */
  async import(a: Actor, d: ImportTransportDto) {
    this.access.requireInternal(a);
    const customer = await this.customer(a, d.customerId);
    const errors: ImportRowError[] = [];
    const addresses = await this.db.query<AddressRow[]>(
      `SELECT id, customer_id, code, "dealerName", region, kind, "isActive" FROM customer_addresses WHERE customer_id = $1`,
      [customer.id],
    );
    const byCode = new Map(
      addresses
        .filter((x) => x.code)
        .map((x) => [x.code!.trim().toUpperCase(), x] as const),
    );
    const carriers = await this.db.query<
      { id: string; name: string; short_name: string | null }[]
    >(
      `SELECT id, name, short_name FROM carriers WHERE status = 'ACTIVE' AND organization_id = ANY($1::uuid[])`,
      [a.orgIds],
    );
    const carrierByKey = new Map<string, string[]>();
    for (const c of carriers)
      for (const key of [c.short_name, c.name]) {
        const k = key?.trim().toUpperCase();
        if (!k) continue;
        carrierByKey.set(k, [...(carrierByKey.get(k) ?? []), c.id]);
      }

    const groups = new Map<string, { order: NewOrder; rows: number[] }>();
    for (const r of d.rows) {
      const fail = (message: string) => errors.push({ row: r.row, message });
      const requestNo = r.customerRequestNo?.trim();
      if (!requestNo) {
        fail('缺少 CustomerRequestNo');
        continue;
      }
      let vin: string | null = null;
      try {
        vin = r.vin?.trim() ? normalizeTransportVin(r.vin) : null;
      } catch (e) {
        fail((e as Error).message);
        continue;
      }
      const qtyText = r.quantity?.trim();
      let quantity = 1;
      if (vin) {
        if (qtyText && qtyText !== '1') fail('填写了 VIN 的行 Quantity 只能为空或 1');
      } else {
        quantity = Number(qtyText);
        if (!qtyText || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
          fail('没有 VIN 时 Quantity 必须是 1–500 的整数');
          continue;
        }
      }
      const origin = byCode.get(r.origin?.trim().toUpperCase() ?? '');
      const dealer = byCode.get(r.dealer?.trim().toUpperCase() ?? '');
      if (!origin) fail(`发货地 ${r.origin || '(空)'} 不是该客户已维护的地点`);
      else if (!origin.isActive) fail(`发货地 ${r.origin} 已停用`);
      if (!dealer) fail(`收货地 ${r.dealer || '(空)'} 不是该客户已维护的地点`);
      else if (!dealer.isActive) fail(`收货地 ${r.dealer} 已停用`);
      if (origin && dealer && origin.id === dealer.id) fail('发货地和收货地不能相同');
      let towType: TowType | null = null;
      try {
        towType = parseTowType(r.armada);
      } catch (e) {
        fail((e as Error).message);
      }
      let carrierId: string | null = null;
      if (r.vendor?.trim()) {
        const hits = carrierByKey.get(r.vendor.trim().toUpperCase()) ?? [];
        if (hits.length !== 1)
          fail(
            hits.length
              ? `物流商 ${r.vendor} 匹配到多家，请用唯一简称`
              : `物流商 ${r.vendor} 不存在或未启用`,
          );
        else carrierId = hits[0];
        if (!towType) fail('指定物流商时必须填写拖车类型（Armada）');
      }
      const dates: (string | null)[] = [];
      for (const [label, value] of [
        ['PlannedPickupDate', r.plannedPickupDate],
        ['PlannedDeliveryDate', r.plannedDeliveryDate],
      ] as const) {
        const v = value?.trim() || null;
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${label} 必须是 YYYY-MM-DD`);
        dates.push(v);
      }
      if (!origin || !dealer) continue;
      let group = groups.get(requestNo);
      if (!group) {
        group = {
          order: {
            customerRequestNo: requestNo,
            plannedPickupDate: dates[0],
            plannedDeliveryDate: dates[1],
            remark: r.remark?.trim() ?? '',
            lines: [],
          },
          rows: [],
        };
        groups.set(requestNo, group);
      } else {
        const o = group.order;
        if (
          (dates[0] && o.plannedPickupDate && dates[0] !== o.plannedPickupDate) ||
          (dates[1] && o.plannedDeliveryDate && dates[1] !== o.plannedDeliveryDate)
        )
          fail(`同一订单 ${requestNo} 的计划日期不一致`);
        o.plannedPickupDate ??= dates[0];
        o.plannedDeliveryDate ??= dates[1];
        if (!o.remark && r.remark?.trim()) o.remark = r.remark.trim();
      }
      for (let i = 0; i < quantity; i += 1) {
        group.order.lines.push({
          vin,
          originId: origin.id,
          destinationId: dealer.id,
          vehicleConfig: r.vehicleConfig?.trim() ?? '',
          vehicleModel: r.vehicleModel?.trim() ?? '',
          vehicleColor: r.vehicleColor?.trim() ?? '',
          towType,
          carrierId,
        });
        group.rows.push(r.row);
      }
    }
    errors.push(...(await this.validate(this.db.manager, a, customer, [...groups.values()])));
    errors.sort((x, y) => x.row - y.row);
    const summary = [...groups.values()].map((g) => ({
      customerRequestNo: g.order.customerRequestNo,
      lineCount: g.order.lines.length,
      withVin: g.order.lines.filter((l) => l.vin).length,
      allocated: g.order.lines.filter((l) => l.carrierId).length,
      plannedPickupDate: g.order.plannedPickupDate,
      plannedDeliveryDate: g.order.plannedDeliveryDate,
    }));
    if (errors.length || d.dryRun) return { errors, orders: summary, created: [] };
    const created = await this.access.tx((m) =>
      this.insert(m, a, customer, [...groups.values()].map((g) => g.order), 'EXCEL'),
    );
    return { errors: [], orders: summary, created };
  }

  // ------------------------------------------------------------------ 明细维护
  async supplementVins(a: Actor, orderId: string, d: SupplementVinsDto) {
    this.access.requireInternal(a);
    return this.access.tx(async (m) => {
      const order = await this.lockOrder(m, a, orderId);
      const vins = d.items.map((i) => normalizeTransportVin(i.vin));
      if (new Set(vins).size !== vins.length) throw new BadRequestException('VIN 重复');
      await this.assertVinsFree(m, vins);
      for (const [idx, item] of d.items.entries()) {
        const [line] = await m.query<LineRow[]>(
          'SELECT * FROM transport_lines WHERE id = $1 AND order_id = $2 FOR UPDATE',
          [item.lineId, orderId],
        );
        if (!line) throw new NotFoundException('明细不属于该需求单');
        if (line.vin) throw new BadRequestException(`第 ${line.line_no} 行已有 VIN ${line.vin}`);
        if (!EDITABLE_BEFORE_PICKUP.includes(line.status))
          throw new BadRequestException(`第 ${line.line_no} 行当前状态不能补 VIN`);
        await m.query('UPDATE transport_lines SET vin = $1, updated_at = now() WHERE id = $2', [
          vins[idx],
          line.id,
        ]);
        await this.access.event(m, a, {
          organizationId: order.organization_id,
          orderId,
          lineId: line.id,
          vin: vins[idx],
          action: 'VIN_SUPPLEMENTED',
        });
      }
      return { updated: d.items.length };
    });
  }

  async updateLine(a: Actor, lineId: string, d: UpdateLineDto) {
    this.access.requireInternal(a);
    return this.access.tx(async (m) => {
      const line = await this.lockLine(m, a, lineId);
      if (!EDITABLE_BEFORE_PICKUP.includes(line.status))
        throw new BadRequestException('已提货的明细不能修改');
      const patch: Record<string, unknown> = {};
      if (d.vin !== undefined) {
        const vin = d.vin?.trim() ? normalizeTransportVin(d.vin) : null;
        if (vin && vin !== line.vin) await this.assertVinsFree(m, [vin]);
        patch.vin = vin;
      }
      if (d.vehicleConfig !== undefined) patch.vehicle_config = d.vehicleConfig.trim();
      if (d.vehicleModel !== undefined) patch.vehicle_model = d.vehicleModel.trim();
      if (d.vehicleColor !== undefined) patch.vehicle_color = d.vehicleColor.trim();
      const keys = Object.keys(patch);
      if (!keys.length) return line;
      const [saved] = await this.access.rows<LineRow>(
        m,
        `UPDATE transport_lines SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [lineId, ...keys.map((k) => patch[k])],
      );
      await this.access.event(m, a, {
        organizationId: line.organization_id,
        orderId: line.order_id,
        lineId,
        vin: saved.vin ?? line.vin,
        action: 'LINE_UPDATED',
        payload: { before: { vin: line.vin }, patch: d },
      });
      return saved;
    });
  }

  /** 调度按台指定物流商 + 拖车类型；已派车的明细要先移出趟次才能改。 */
  async allocate(a: Actor, d: AllocateLinesDto) {
    this.access.requireInternal(a);
    const towType = parseTowType(d.towType)!;
    return this.access.tx(async (m) => {
      const [carrier] = await m.query<{ id: string; organization_id: string; status: string }[]>(
        'SELECT id, organization_id, status FROM carriers WHERE id = $1',
        [d.carrierId],
      );
      if (!carrier || carrier.status !== 'ACTIVE' || !a.orgIds.includes(carrier.organization_id))
        throw new BadRequestException('物流商不存在、未启用或不在当前机构');
      const lines = await this.lockLines(m, a, d.lineIds);
      for (const line of lines)
        if (!['UNALLOCATED', 'ALLOCATED'].includes(line.status))
          throw new BadRequestException(`第 ${line.line_no} 行已派车或已结束，不能重新分配`);
      await m.query(
        `UPDATE transport_lines SET carrier_id = $1, tow_type = $2, status = 'ALLOCATED', updated_at = now()
         WHERE id = ANY($3::uuid[])`,
        [d.carrierId, towType, d.lineIds],
      );
      for (const line of lines)
        await this.access.event(m, a, {
          organizationId: line.organization_id,
          orderId: line.order_id,
          lineId: line.id,
          vin: line.vin,
          action: 'LINE_ALLOCATED',
          payload: { carrierId: d.carrierId, towType, previousCarrierId: line.carrier_id },
        });
      return { updated: lines.length };
    });
  }

  async cancelLines(a: Actor, d: CancelLinesDto) {
    this.access.requireInternal(a);
    const reason = d.reason.trim();
    if (!reason) throw new BadRequestException('请填写取消原因');
    return this.access.tx(async (m) => {
      const lines = await this.lockLines(m, a, d.lineIds);
      for (const line of lines)
        if (!EDITABLE_BEFORE_PICKUP.includes(line.status))
          throw new BadRequestException(`第 ${line.line_no} 行已提货或已结束，不能取消`);
      await this.cancel(m, a, lines, reason);
      return { cancelled: lines.length };
    });
  }

  async cancelOrder(a: Actor, orderId: string, reason: string) {
    this.access.requireInternal(a);
    reason = reason.trim();
    if (!reason) throw new BadRequestException('请填写取消原因');
    return this.access.tx(async (m) => {
      const order = await this.lockOrder(m, a, orderId);
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE order_id = $1 AND status = ANY($2::varchar[]) ORDER BY line_no FOR UPDATE`,
        [orderId, EDITABLE_BEFORE_PICKUP],
      );
      await this.cancel(m, a, lines, reason);
      await this.access.event(m, a, {
        organizationId: order.organization_id,
        orderId,
        action: 'ORDER_CANCELLED',
        reason,
        payload: { cancelledLines: lines.length },
      });
      return { cancelled: lines.length };
    });
  }

  async refreshOrders(m: EntityManager, orderIds: string[]) {
    for (const id of [...new Set(orderIds)]) {
      const rows = await m.query<{ status: string }[]>(
        'SELECT status FROM transport_lines WHERE order_id = $1',
        [id],
      );
      const status = deriveOrderStatus(rows.map((r) => r.status));
      await m.query(
        `UPDATE transport_orders SET status = $1,
           completed_at = CASE WHEN $1 = 'OPEN' THEN NULL ELSE COALESCE(completed_at, now()) END
         WHERE id = $2 AND status IS DISTINCT FROM $1`,
        [status, id],
      );
    }
  }

  // ------------------------------------------------------------------ 内部工具
  private async cancel(m: EntityManager, a: Actor, lines: LineRow[], reason: string) {
    if (!lines.length) return;
    await m.query(
      `UPDATE transport_lines SET status = 'CANCELLED', trip_id = NULL, end_reason = $1, updated_at = now()
       WHERE id = ANY($2::uuid[])`,
      [reason, lines.map((l) => l.id)],
    );
    for (const line of lines)
      await this.access.event(m, a, {
        organizationId: line.organization_id,
        orderId: line.order_id,
        tripId: line.trip_id,
        lineId: line.id,
        vin: line.vin,
        action: 'LINE_CANCELLED',
        reason,
      });
    await this.refreshOrders(m, lines.map((l) => l.order_id));
  }

  private async customer(a: Actor, customerId: string) {
    const [customer] = await this.db.query<
      { id: string; name: string; organization_id: string; status: string }[]
    >('SELECT id, name, organization_id, status FROM customers WHERE id = $1', [customerId]);
    if (!customer || !a.orgIds.includes(customer.organization_id))
      throw new ForbiddenException('客户不存在或不在当前机构');
    if (customer.status !== 'ACTIVE') throw new BadRequestException('客户已暂停或停用，不能新建运输');
    return customer;
  }

  /** 地点归属、物流商、VIN 占用、客户订单号等需要查库的校验；rows 与 order.lines 一一对应。 */
  private async validate(
    m: EntityManager,
    a: Actor,
    customer: { id: string },
    groups: { order: NewOrder; rows: number[] }[],
  ): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    const lines = groups.flatMap((g) => g.order.lines.map((l, i) => ({ l, row: g.rows[i] })));
    const addressIds = [...new Set(lines.flatMap(({ l }) => [l.originId, l.destinationId]))];
    const addresses = await m.query<AddressRow[]>(
      `SELECT id, customer_id, code, "dealerName", region, kind, "isActive" FROM customer_addresses WHERE id = ANY($1::uuid[])`,
      [addressIds],
    );
    const addressById = new Map(addresses.map((x) => [x.id, x]));
    const carrierIds = [...new Set(lines.map(({ l }) => l.carrierId).filter(Boolean))] as string[];
    const carriers = carrierIds.length
      ? await m.query<{ id: string; organization_id: string; status: string }[]>(
          'SELECT id, organization_id, status FROM carriers WHERE id = ANY($1::uuid[])',
          [carrierIds],
        )
      : [];
    const carrierOk = new Set(
      carriers
        .filter((c) => c.status === 'ACTIVE' && a.orgIds.includes(c.organization_id))
        .map((c) => c.id),
    );
    for (const { l, row } of lines) {
      for (const id of [l.originId, l.destinationId]) {
        const x = addressById.get(id);
        if (!x || x.customer_id !== customer.id)
          errors.push({ row, message: '起点或终点不是该客户已维护的地点' });
        else if (!x.isActive) errors.push({ row, message: `地点 ${x.code ?? x.dealerName} 已停用` });
      }
      if (l.originId === l.destinationId) errors.push({ row, message: '发货地和收货地不能相同' });
      if (l.carrierId && !carrierOk.has(l.carrierId))
        errors.push({ row, message: '物流商不存在、未启用或不在当前机构' });
    }
    for (const g of groups) {
      if (g.order.lines.length > MAX_LINES_PER_ORDER)
        errors.push({ row: g.rows[0], message: `订单 ${g.order.customerRequestNo} 超过 ${MAX_LINES_PER_ORDER} 台` });
      const { plannedPickupDate: p, plannedDeliveryDate: dd } = g.order;
      if (p && dd && dd < p)
        errors.push({ row: g.rows[0], message: `订单 ${g.order.customerRequestNo} 计划到达日早于提货日` });
    }
    const vinRows = new Map<string, number>();
    for (const { l, row } of lines) {
      if (!l.vin) continue;
      if (vinRows.has(l.vin)) errors.push({ row, message: `VIN ${l.vin} 在文件中重复` });
      else vinRows.set(l.vin, row);
    }
    if (vinRows.size) {
      const vins = [...vinRows.keys()];
      const busy = await m.query<{ vin: string; code: string }[]>(
        `SELECT l.vin, o.code FROM transport_lines l JOIN transport_orders o ON o.id = l.order_id
         WHERE l.vin = ANY($1::varchar[]) AND l.status NOT IN ('DELIVERED','CLOSED','CANCELLED')`,
        [vins],
      );
      for (const b of busy)
        errors.push({ row: vinRows.get(b.vin)!, message: `VIN ${b.vin} 已在进行中的需求单 ${b.code}` });
      const legacy = await m.query<{ vin: string }[]>(
        `SELECT DISTINCT upper(trim(v.vin)) vin FROM waybill_vins v JOIN waybills w ON w.id = v.waybill_id
         WHERE upper(trim(v.vin)) = ANY($1::varchar[]) AND w.status <> 'ARRIVED'`,
        [vins],
      );
      for (const b of legacy)
        errors.push({ row: vinRows.get(b.vin)!, message: `VIN ${b.vin} 在场地运单中` });
      const stock = await m.query<{ vin: string }[]>(
        `SELECT DISTINCT upper(trim(current_vin)) vin FROM yard_slots
         WHERE upper(trim(current_vin)) = ANY($1::varchar[]) AND status = 'OCCUPIED'`,
        [vins],
      );
      for (const b of stock)
        errors.push({ row: vinRows.get(b.vin)!, message: `VIN ${b.vin} 在场地库存中，请走出库流程` });
    }
    const requestNos = groups.map((g) => g.order.customerRequestNo);
    const dup = await m.query<{ customer_request_no: string }[]>(
      `SELECT customer_request_no FROM transport_orders WHERE customer_id = $1 AND customer_request_no = ANY($2::varchar[])`,
      [customer.id, requestNos],
    );
    for (const x of dup) {
      const g = groups.find((y) => y.order.customerRequestNo === x.customer_request_no)!;
      errors.push({ row: g.rows[0], message: `客户订单号 ${x.customer_request_no} 已存在` });
    }
    return errors;
  }

  private async insert(
    m: EntityManager,
    a: Actor,
    customer: { id: string; organization_id: string },
    orders: NewOrder[],
    source: 'MANUAL' | 'EXCEL',
  ) {
    const created: OrderRow[] = [];
    for (const o of orders) {
      const [order] = await m.query<OrderRow[]>(
        `INSERT INTO transport_orders(code, organization_id, customer_id, customer_request_no, planned_pickup_date,
           planned_delivery_date, source, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *, planned_pickup_date::text planned_pickup_date, planned_delivery_date::text planned_delivery_date`,
        [
          transportCode('TO'),
          customer.organization_id,
          customer.id,
          o.customerRequestNo,
          o.plannedPickupDate,
          o.plannedDeliveryDate,
          source,
          o.remark,
          a.user.userId,
        ],
      );
      for (const [i, l] of o.lines.entries()) {
        const [line] = await m.query<{ id: string }[]>(
          `INSERT INTO transport_lines(order_id, organization_id, customer_id, line_no, vin, origin_id, destination_id,
             vehicle_config, vehicle_model, vehicle_color, tow_type, carrier_id, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [
            order.id,
            customer.organization_id,
            customer.id,
            i + 1,
            l.vin,
            l.originId,
            l.destinationId,
            l.vehicleConfig,
            l.vehicleModel,
            l.vehicleColor,
            l.towType,
            l.carrierId,
            l.carrierId ? 'ALLOCATED' : 'UNALLOCATED',
          ],
        );
        if (l.vin || l.carrierId)
          await this.access.event(m, a, {
            organizationId: customer.organization_id,
            orderId: order.id,
            lineId: line.id,
            vin: l.vin,
            action: 'LINE_CREATED',
            payload: { carrierId: l.carrierId, towType: l.towType },
          });
      }
      await this.access.event(m, a, {
        organizationId: customer.organization_id,
        orderId: order.id,
        action: 'ORDER_CREATED',
        payload: { source, lineCount: o.lines.length },
      });
      created.push(order);
    }
    return created;
  }

  private async assertVinsFree(m: EntityManager, vins: string[]) {
    const busy = await m.query<{ vin: string; code: string }[]>(
      `SELECT l.vin, o.code FROM transport_lines l JOIN transport_orders o ON o.id = l.order_id
       WHERE l.vin = ANY($1::varchar[]) AND l.status NOT IN ('DELIVERED','CLOSED','CANCELLED') LIMIT 1`,
      [vins],
    );
    if (busy.length)
      throw new ConflictException(`VIN ${busy[0].vin} 已在进行中的需求单 ${busy[0].code}`);
    for (const vin of vins) await this.access.assertNotInYard(m, vin);
  }

  private async lockOrder(m: EntityManager, a: Actor, id: string) {
    const [order] = await m.query<OrderRow[]>(
      'SELECT * FROM transport_orders WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!order) throw new NotFoundException('运输需求单不存在');
    this.access.requireOrg(a, order.organization_id);
    return order;
  }

  private async lockLine(m: EntityManager, a: Actor, id: string) {
    const [line] = await m.query<LineRow[]>(
      'SELECT * FROM transport_lines WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!line) throw new NotFoundException('运输明细不存在');
    this.access.requireOrg(a, line.organization_id);
    return line;
  }

  private async lockLines(m: EntityManager, a: Actor, ids: string[]) {
    const unique = [...new Set(ids)];
    const lines = await m.query<LineRow[]>(
      'SELECT * FROM transport_lines WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [unique],
    );
    if (lines.length !== unique.length) throw new NotFoundException('部分运输明细不存在');
    for (const line of lines) this.access.requireOrg(a, line.organization_id);
    return lines;
  }
}

/** 明细 + 需求单、客户、地点、物流商、趟次的展示字段。 */
export const LINE_SELECT = `
  SELECT l.*, o.code order_code, o.customer_request_no, o.planned_pickup_date::text planned_pickup_date, o.planned_delivery_date::text planned_delivery_date,
    c.name customer_name,
    oa.code origin_code, oa."dealerName" origin_name, oa.kind origin_kind,
    da.code destination_code, da."dealerName" destination_name, da.region destination_region, da.kind destination_kind,
    cr.name carrier_name, cr.short_name carrier_short_name,
    t.code trip_code, t.status trip_status
  FROM transport_lines l
  JOIN transport_orders o ON o.id = l.order_id
  JOIN customers c ON c.id = l.customer_id
  JOIN customer_addresses oa ON oa.id = l.origin_id
  JOIN customer_addresses da ON da.id = l.destination_id
  LEFT JOIN carriers cr ON cr.id = l.carrier_id
  LEFT JOIN transport_trips t ON t.id = l.trip_id`;
