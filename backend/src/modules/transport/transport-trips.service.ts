import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Actor, TransportAccess, localDate } from './transport.access';
import {
  BatchTripsDto,
  CreateTripDto,
  ForceStatusDto,
  PickupScanDto,
  RecordExceptionDto,
  ReassignTripDto,
  RemoveTripLinesDto,
  ResolveExceptionDto,
  SignScanDto,
} from './transport.dto';
import { ExceptionRow, LineRow, TripRow } from './transport.rows';
import {
  DEFAULT_CAPACITY,
  TowType,
  decideScan,
  normalizeTransportVin,
  transportCode,
  tripCanComplete,
  vehicleCapacity,
} from './transport.rules';
import { LINE_SELECT, TransportOrdersService } from './transport-orders.service';
import { TransportFinanceService } from './transport-finance.service';

const LOADABLE = ['PLANNED', 'LOADING'];
const ON_TRUCK = ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CLOSED'];

@Injectable()
export class TransportTripsService {
  constructor(
    private readonly access: TransportAccess,
    private readonly orders: TransportOrdersService,
    private readonly finance: TransportFinanceService,
  ) {}

  private get db() {
    return this.access.db;
  }

  // ------------------------------------------------------------------ 查询
  async list(
    a: Actor,
    q: {
      status?: string;
      search?: string;
      unassigned?: boolean;
      /** 趟次创建日期（按机构时区）范围 */
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const args: unknown[] = [];
    const where = [this.access.tripFilter(a, 't', args)];
    const created = localDate('t.created_at', 't.organization_id');
    if (q.from) {
      args.push(q.from);
      where.push(`${created} >= $${args.length}`);
    }
    if (q.to) {
      args.push(q.to);
      where.push(`${created} <= $${args.length}`);
    }
    if (q.unassigned) where.push(`t.status = 'PLANNED' AND t.driver_id IS NULL`);
    if (q.status) {
      args.push(q.status.split(',').map((s) => s.trim()).filter(Boolean));
      where.push(`t.status = ANY($${args.length}::varchar[])`);
    }
    if (q.search?.trim()) {
      args.push(`%${q.search.trim()}%`);
      const p = `$${args.length}`;
      where.push(
        `(t.code ILIKE ${p} OR v."plateNumber" ILIKE ${p} OR d.name ILIKE ${p}
          OR EXISTS (SELECT 1 FROM transport_lines sl WHERE sl.trip_id = t.id AND sl.vin ILIKE ${p}))`,
      );
    }
    const from = `FROM transport_trips t
      JOIN carriers cr ON cr.id = t.carrier_id
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN carrier_vehicles v ON v.id = t.vehicle_id
      WHERE ${where.join(' AND ')}`;
    const [{ total }] = await this.db.query<{ total: number }[]>(`SELECT count(*)::int total ${from}`, args);
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const items = await this.db.query(
      // 待指派车辆的趟次司机、车牌给空串：已发布的 App 把这两个字段当非空字符串解析
      `SELECT t.*, cr.name carrier_name, coalesce(d.name, '') driver_name, d.phone driver_phone,
         coalesce(v."plateNumber", '') plate_number,
         (SELECT count(*)::int FROM transport_lines l WHERE l.trip_id = t.id AND l.status <> 'CANCELLED') line_count,
         (SELECT count(*)::int FROM transport_lines l WHERE l.trip_id = t.id AND l.status IN ('PICKED_UP','IN_TRANSIT','DELIVERED','CLOSED')) loaded_count,
         (SELECT count(*)::int FROM transport_lines l WHERE l.trip_id = t.id AND l.status = 'DELIVERED') delivered_count,
         (SELECT string_agg(DISTINCT a."dealerName", ' / ') FROM transport_lines l JOIN customer_addresses a ON a.id = l.origin_id WHERE l.trip_id = t.id) origins,
         (SELECT string_agg(DISTINCT a."dealerName", ' / ') FROM transport_lines l JOIN customer_addresses a ON a.id = l.destination_id WHERE l.trip_id = t.id) destinations,
         (SELECT count(*)::int FROM transport_exceptions e WHERE e.trip_id = t.id AND e.status = 'OPEN') open_exceptions,
         (SELECT string_agg(DISTINCT c.name, ' / ') FROM transport_lines l JOIN customers c ON c.id = l.customer_id WHERE l.trip_id = t.id) customers,
         (SELECT string_agg(DISTINCT l.dispatch_group, ' / ') FROM transport_lines l WHERE l.trip_id = t.id) dispatch_groups
       ${from}
       ORDER BY CASE t.status WHEN 'LOADING' THEN 0 WHEN 'PLANNED' THEN 1 WHEN 'IN_TRANSIT' THEN 2 ELSE 3 END, t.created_at DESC
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, total };
  }

  async detail(a: Actor, id: string) {
    const trip = await this.access.trip(this.db.manager, a, id, 'READ');
    const [resources] = await this.db.query(
      `SELECT cr.name carrier_name, cr.short_name carrier_short_name, coalesce(d.name, '') driver_name, d.phone driver_phone,
         coalesce(v."plateNumber", '') plate_number
       FROM carriers cr LEFT JOIN drivers d ON d.id = $2 LEFT JOIN carrier_vehicles v ON v.id = $3 WHERE cr.id = $1`,
      [trip.carrier_id, trip.driver_id, trip.vehicle_id],
    );
    const args: unknown[] = [id];
    let lineFilter = '';
    if (a.customerId) {
      args.push(a.customerId);
      lineFilter = ` AND l.customer_id = $2`;
    }
    const lines = await this.db.query<(LineRow & Record<string, unknown>)[]>(
      `${LINE_SELECT} WHERE l.trip_id = $1${lineFilter} ORDER BY oa."dealerName", da."dealerName", o.code, l.line_no`,
      args,
    );
    const documents = await this.db.query<
      { id: string; origin_id: string; destination_id: string; file_key: string; file_name: string; mime_type: string; created_at: Date }[]
    >(
      `SELECT id, origin_id, destination_id, file_key, file_name, mime_type, created_at FROM transport_documents
       WHERE trip_id = $1 ORDER BY created_at`,
      [id],
    );
    // 段：趟次内每个（起点，终点）组合；POD 按段上传
    const legs = new Map<string, Record<string, unknown> & { lines: number; loaded: number; delivered: number }>();
    for (const l of lines) {
      const key = `${l.origin_id}>${l.destination_id}`;
      const leg =
        legs.get(key) ??
        ({
          originId: l.origin_id,
          originCode: l.origin_code,
          originName: l.origin_name,
          destinationId: l.destination_id,
          destinationCode: l.destination_code,
          destinationName: l.destination_name,
          lines: 0,
          loaded: 0,
          delivered: 0,
        } as Record<string, unknown> & { lines: number; loaded: number; delivered: number });
      leg.lines += 1;
      if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CLOSED'].includes(l.status)) leg.loaded += 1;
      if (l.status === 'DELIVERED') leg.delivered += 1;
      legs.set(key, leg);
    }
    const legList = [...legs.values()].map((leg) => ({
      ...leg,
      documents: documents.filter(
        (d) => d.origin_id === leg.originId && d.destination_id === leg.destinationId,
      ),
    }));
    const exceptions = a.customerId
      ? []
      : await this.db.query(
          `SELECT e.*, u."displayName" reported_by_name FROM transport_exceptions e
           JOIN users u ON u.id = e.reported_by WHERE e.trip_id = $1 ORDER BY e.reported_at DESC`,
          [id],
        );
    const events = a.internal
      ? await this.db.query(
          `SELECT e.id, e.action, e.vin, e.reason, e.payload, e.created_at, u."displayName" operator_name
           FROM transport_events e JOIN users u ON u.id = e.operator_id
           WHERE e.trip_id = $1 ORDER BY e.created_at DESC LIMIT 500`,
          [id],
        )
      : [];
    return { trip: { ...trip, ...resources }, lines, legs: legList, exceptions, events };
  }

  async exceptions(a: Actor, q: { status?: string; page: number; pageSize: number }) {
    this.access.requireInternal(a);
    const args: unknown[] = [a.orgIds];
    let where = 'e.organization_id = ANY($1::uuid[])';
    if (q.status) {
      args.push(q.status);
      where += ` AND e.status = $${args.length}`;
    }
    const [{ total }] = await this.db.query<{ total: number }[]>(
      `SELECT count(*)::int total FROM transport_exceptions e WHERE ${where}`,
      args,
    );
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const items = await this.db.query(
      `SELECT e.*, t.code trip_code, t.status trip_status, cr.name carrier_name, u."displayName" reported_by_name
       FROM transport_exceptions e
       JOIN transport_trips t ON t.id = e.trip_id
       JOIN carriers cr ON cr.id = t.carrier_id
       JOIN users u ON u.id = e.reported_by
       WHERE ${where}
       ORDER BY CASE e.status WHEN 'OPEN' THEN 0 ELSE 1 END, e.reported_at DESC
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, total };
  }

  // ------------------------------------------------------------------ 派车
  async create(a: Actor, d: CreateTripDto) {
    this.requireDispatcher(a, d.carrierId);
    return this.access.tx((m) => this.createIn(m, a, d, false));
  }

  /**
   * 按组派车：每组一趟，各自一个事务，互不影响；失败的返回原因，成功的照常生成。
   * 内部人员派车时，组里还没分配或分配给别家的车会一并分配给所选物流商。
   */
  async createBatch(a: Actor, d: BatchTripsDto) {
    const results: { index: number; tripId?: string; tripCode?: string; error?: string }[] = [];
    for (const [index, item] of d.items.entries()) {
      try {
        this.requireDispatcher(a, item.carrierId);
        const trip = await this.access.tx((m) => this.createIn(m, a, item, a.internal));
        results.push({ index, tripId: trip.id, tripCode: trip.code });
      } catch (e) {
        results.push({ index, error: (e as Error).message });
      }
    }
    return { created: results.filter((r) => r.tripId).length, results };
  }

  private requireDispatcher(a: Actor, carrierId: string) {
    if (!a.internal && !a.carrierStaff) throw new ForbiddenException('只有机构或承运商业务员可以派车');
    if (a.carrierStaff && carrierId !== a.carrierId) throw new ForbiddenException('只能为本承运商派车');
  }

  /** 物流商、司机、拖车三者校验：都启用，司机和拖车属于该物流商，拖车维护了类型 */
  private async resources(m: EntityManager, a: Actor, carrierId: string, driverId: string, vehicleId: string) {
    const [carrier] = await m.query<{ id: string; organization_id: string; status: string }[]>(
      'SELECT id, organization_id, status FROM carriers WHERE id = $1',
      [carrierId],
    );
    if (!carrier || carrier.status !== 'ACTIVE') throw new BadRequestException('物流商不存在或未启用');
    if (a.internal) this.access.requireOrg(a, carrier.organization_id);
    const [driver] = await m.query<{ carrier_id: string; isActive: boolean }[]>(
      'SELECT carrier_id, "isActive" FROM drivers WHERE id = $1',
      [driverId],
    );
    if (!driver || driver.carrier_id !== carrierId || !driver.isActive)
      throw new BadRequestException('司机不属于该物流商或已停用');
    const [vehicle] = await m.query<
      { carrier_id: string; isActive: boolean; towType: TowType | null; capacity: number | null }[]
    >('SELECT carrier_id, "isActive", "towType", capacity FROM carrier_vehicles WHERE id = $1', [vehicleId]);
    if (!vehicle || vehicle.carrier_id !== carrierId || !vehicle.isActive)
      throw new BadRequestException('拖车不属于该物流商或已停用');
    if (!vehicle.towType) throw new BadRequestException('请先在主数据里维护该拖车的类型');
    return { carrier, towType: vehicle.towType, capacity: vehicleCapacity(vehicle.towType, vehicle.capacity) };
  }

  private async createIn(
    m: EntityManager,
    a: Actor,
    d: { lineIds: string[]; carrierId: string; driverId?: string; vehicleId?: string },
    allocate: boolean,
  ) {
    // 只定物流商：拖车类型取组里车的要求，载量先按类型默认，指派拖车时再按实车校验
    const assigned = !!(d.driverId || d.vehicleId);
    const { carrier, towType, capacity } = assigned
      ? await this.resources(m, a, d.carrierId, d.driverId ?? '', d.vehicleId ?? '')
      : await this.carrierOnly(m, a, d.carrierId, d.lineIds);
    if (allocate) await this.allocateForTrip(m, a, d.lineIds, d.carrierId, towType);
    const lines = await this.lockAssignable(m, a, d.lineIds, d.carrierId, towType);
    if (lines.length > capacity)
      throw new BadRequestException(`该拖车最多装 ${capacity} 台，已选 ${lines.length} 台`);
    const [trip] = await m.query<TripRow[]>(
      `INSERT INTO transport_trips(code, organization_id, carrier_id, driver_id, vehicle_id, tow_type, capacity, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [transportCode('TT'), carrier.organization_id, d.carrierId, d.driverId ?? null, d.vehicleId ?? null, towType, capacity, a.user.userId],
    );
    await this.attach(m, a, trip, lines);
    await this.access.event(m, a, {
      organizationId: trip.organization_id,
      tripId: trip.id,
      action: 'TRIP_CREATED',
      payload: { driverId: d.driverId ?? null, vehicleId: d.vehicleId ?? null, lines: lines.length },
    });
    return trip;
  }

  private async carrierOnly(m: EntityManager, a: Actor, carrierId: string, lineIds: string[]) {
    const [carrier] = await m.query<{ id: string; organization_id: string; status: string }[]>(
      'SELECT id, organization_id, status FROM carriers WHERE id = $1',
      [carrierId],
    );
    if (!carrier || carrier.status !== 'ACTIVE') throw new BadRequestException('物流商不存在或未启用');
    if (a.internal) this.access.requireOrg(a, carrier.organization_id);
    const types = await m.query<{ tow_type: TowType | null }[]>(
      'SELECT DISTINCT tow_type FROM transport_lines WHERE id = ANY($1::uuid[])',
      [[...new Set(lineIds)]],
    );
    if (types.length !== 1 || !types[0].tow_type)
      throw new BadRequestException('这组车的拖车类型不一致或没有指定，请先调整');
    const towType = types[0].tow_type;
    return { carrier, towType, capacity: DEFAULT_CAPACITY[towType] };
  }

  /** 没指派司机和拖车的趟次不能提货 */
  private requireAssigned(trip: TripRow) {
    if (!trip.driver_id || !trip.vehicle_id) throw new BadRequestException('请先为这趟车指派司机和拖车');
  }

  /** 按组派车时顺手分配：待分配 / 已分配给别家的车改派给所选物流商；拖车类型不一致的照样报错 */
  private async allocateForTrip(m: EntityManager, a: Actor, ids: string[], carrierId: string, towType: TowType) {
    const lines = await m.query<LineRow[]>(
      `SELECT * FROM transport_lines WHERE id = ANY($1::uuid[]) AND status IN ('UNALLOCATED','ALLOCATED')
         AND carrier_id IS DISTINCT FROM $2 ORDER BY id FOR UPDATE`,
      [[...new Set(ids)], carrierId],
    );
    for (const l of lines) {
      this.access.requireOrg(a, l.organization_id);
      if (l.tow_type && l.tow_type !== towType)
        throw new BadRequestException(`第 ${l.line_no} 行要求 ${l.tow_type}，与拖车类型 ${towType} 不一致`);
    }
    if (!lines.length) return;
    await m.query(
      `UPDATE transport_lines SET carrier_id = $1, tow_type = $2, status = 'ALLOCATED', updated_at = now()
       WHERE id = ANY($3::uuid[])`,
      [carrierId, towType, lines.map((l) => l.id)],
    );
    for (const l of lines)
      await this.access.event(m, a, {
        organizationId: l.organization_id,
        orderId: l.order_id,
        lineId: l.id,
        vin: l.vin,
        action: 'LINE_ALLOCATED',
        payload: { carrierId, towType, previousCarrierId: l.carrier_id },
      });
  }

  /**
   * 提货前更换这趟车的物流商 / 司机 / 拖车。拖车类型必须和本趟一致，载量照常校验。
   * 承运商业务员只能在本承运商内换司机和拖车。
   */
  async reassign(a: Actor, tripId: string, d: ReassignTripDto) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      this.requireDispatcher(a, d.carrierId);
      if (trip.status !== 'PLANNED')
        throw new BadRequestException('已开始提货的趟次不能更换物流商；如果是录错了，请用“更正物流商”');
      const { towType, capacity } = await this.resources(m, a, d.carrierId, d.driverId, d.vehicleId);
      if (towType !== trip.tow_type)
        throw new BadRequestException(`拖车类型必须与本趟一致（${trip.tow_type}），所选拖车是 ${towType}`);
      const [{ n }] = await m.query<{ n: number }[]>(
        `SELECT count(*)::int n FROM transport_lines WHERE trip_id = $1 AND status = 'DISPATCHED'`,
        [tripId],
      );
      if (n > capacity) throw new BadRequestException(`所选拖车最多装 ${capacity} 台，本趟有 ${n} 台`);
      await this.switchCarrier(m, trip, d, capacity);
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        tripId,
        action: trip.driver_id ? 'TRIP_REASSIGNED' : 'TRIP_VEHICLE_ASSIGNED',
        reason: d.reason?.trim() ?? '',
        payload: this.carrierChange(trip, d),
      });
      return { ok: true };
    });
  }

  /**
   * 内部更正：提货后发现物流商录错了。改趟次和明细上的物流商、司机、拖车，
   * 并把本趟未确认的应付改到新物流商、按新物流商的报价重算（手工价也会被重算）。已确认的应付不能更正。
   */
  async correctCarrier(a: Actor, tripId: string, d: ReassignTripDto) {
    this.access.requireInternal(a);
    const reason = d.reason?.trim();
    if (!reason) throw new BadRequestException('请填写更正原因');
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      if (!['LOADING', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status))
        throw new BadRequestException(
          trip.status === 'PLANNED' ? '还没提货，请直接用“更换物流商”' : '已取消的趟次不能更正',
        );
      const { towType } = await this.resources(m, a, d.carrierId, d.driverId, d.vehicleId);
      if (towType !== trip.tow_type)
        throw new BadRequestException(`拖车类型必须与本趟一致（${trip.tow_type}），所选拖车是 ${towType}`);
      const [{ confirmed }] = await m.query<{ confirmed: number }[]>(
        `SELECT count(*)::int confirmed FROM transport_charges WHERE trip_id = $1 AND side = 'PAYABLE' AND status = 'CONFIRMED'`,
        [tripId],
      );
      if (confirmed)
        throw new BadRequestException(`本趟已有 ${confirmed} 条应付已确认，不能更正物流商，请先联系财务处理`);
      await this.switchCarrier(m, trip, d, trip.capacity);
      const repriced = await this.finance.repriceTripPayables(m, a, { ...trip, carrier_id: d.carrierId }, reason);
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        tripId,
        action: 'TRIP_CARRIER_CORRECTED',
        reason,
        payload: { ...this.carrierChange(trip, d), repriced },
      });
      return { ok: true, repriced };
    });
  }

  private async switchCarrier(m: EntityManager, trip: TripRow, d: ReassignTripDto, capacity: number) {
    await m.query(
      `UPDATE transport_trips SET carrier_id = $1, driver_id = $2, vehicle_id = $3, capacity = $4 WHERE id = $5`,
      [d.carrierId, d.driverId, d.vehicleId, capacity, trip.id],
    );
    await m.query(
      `UPDATE transport_lines SET carrier_id = $1, updated_at = now() WHERE trip_id = $2 AND status <> 'CANCELLED'`,
      [d.carrierId, trip.id],
    );
  }

  private carrierChange(trip: TripRow, d: ReassignTripDto) {
    return {
      from: { carrierId: trip.carrier_id, driverId: trip.driver_id, vehicleId: trip.vehicle_id },
      to: { carrierId: d.carrierId, driverId: d.driverId, vehicleId: d.vehicleId },
    };
  }

  async addLines(a: Actor, tripId: string, lineIds: string[]) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      this.requireLoadable(trip);
      const lines = await this.lockAssignable(m, a, lineIds, trip.carrier_id, trip.tow_type);
      const [{ n }] = await m.query<{ n: number }[]>(
        `SELECT count(*)::int n FROM transport_lines WHERE trip_id = $1 AND status IN ('DISPATCHED','PICKED_UP')`,
        [tripId],
      );
      if (n + lines.length > trip.capacity)
        throw new BadRequestException(`该拖车最多装 ${trip.capacity} 台，已有 ${n} 台`);
      await this.attach(m, a, trip, lines);
      return { added: lines.length };
    });
  }

  /** 装车前移出趟次：退回“已分配”，等下一趟。已扫码的车一并卸下。 */
  async removeLines(a: Actor, tripId: string, d: RemoveTripLinesDto) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      this.requireLoadable(trip);
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`,
        [tripId, d.lineIds],
      );
      if (lines.length !== new Set(d.lineIds).size) throw new NotFoundException('部分明细不在本趟次');
      await this.release(m, a, trip, lines, 'LINE_REMOVED_FROM_TRIP', d.reason?.trim() ?? '');
      return { removed: lines.length };
    });
  }

  async cancel(a: Actor, tripId: string, reason: string) {
    reason = reason.trim();
    if (!reason) throw new BadRequestException('请填写取消原因');
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      if (!LOADABLE.includes(trip.status)) throw new BadRequestException('已启运的趟次不能取消');
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND status IN ('DISPATCHED','PICKED_UP') FOR UPDATE`,
        [tripId],
      );
      await this.release(m, a, trip, lines, 'LINE_REMOVED_FROM_TRIP', reason);
      await m.query(
        `UPDATE transport_trips SET status = 'CANCELLED', cancel_reason = $1 WHERE id = $2`,
        [reason, tripId],
      );
      await m.query(
        `UPDATE transport_exceptions SET status = 'RESOLVED', resolution = 'TRIP_CANCELLED', resolution_reason = $1,
           resolved_by = $2, resolved_at = now() WHERE trip_id = $3 AND status = 'OPEN'`,
        [reason, a.user.userId, tripId],
      );
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        tripId,
        action: 'TRIP_CANCELLED',
        reason,
      });
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------ 执行
  async pickup(a: Actor, tripId: string, d: PickupScanDto) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'EXECUTE', true);
      this.requireLoadable(trip);
      this.requireAssigned(trip);
      await this.assertTrailerFree(m, trip);
      const vin = normalizeTransportVin(d.vin);
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND status IN ('DISPATCHED','PICKED_UP')
         ORDER BY line_no, id FOR UPDATE`,
        [tripId],
      );
      const decision = decideScan(vin, lines, d.lineId);
      if (decision.kind === 'ALREADY_PICKED')
        return { result: 'PICKED', line: await this.lineView(m, decision.lineId) };
      if (decision.kind === 'CHOOSE') {
        const options = await m.query(
          `${LINE_SELECT} WHERE l.id = ANY($1::uuid[]) ORDER BY oa."dealerName", da."dealerName"`,
          [decision.lineIds],
        );
        return { result: 'CHOOSE_LINE', vin, options };
      }
      if (decision.kind === 'UNPLANNED') {
        const [elsewhere] = await m.query<{ code: string; status: string }[]>(
          `SELECT o.code, l.status FROM transport_lines l JOIN transport_orders o ON o.id = l.order_id
           WHERE l.vin = $1 AND l.status NOT IN ('DELIVERED','CLOSED','CANCELLED')`,
          [vin],
        );
        if (elsewhere)
          throw new ConflictException(
            `VIN ${vin} 属于需求单 ${elsewhere.code}，不在本趟次；请先让调度把这台车加到本趟次`,
          );
        await this.access.assertNotInYard(m, vin);
        const [exception] = await m.query<ExceptionRow[]>(
          `INSERT INTO transport_exceptions(organization_id, trip_id, vin, type, status, photos, reported_by)
           VALUES ($1,$2,$3,'UNPLANNED_VIN','OPEN',$4,$5)
           ON CONFLICT (trip_id, vin) WHERE type = 'UNPLANNED_VIN' AND status = 'OPEN' DO UPDATE SET photos = EXCLUDED.photos
           RETURNING *`,
          [trip.organization_id, tripId, vin, JSON.stringify(d.photoKeys ?? []), a.user.userId],
        );
        await this.markLoading(m, trip);
        await this.access.event(m, a, {
          organizationId: trip.organization_id,
          tripId,
          vin,
          action: 'UNPLANNED_VIN_SCANNED',
        });
        return { result: 'UNPLANNED', vin, exception };
      }
      const line = lines.find((l) => l.id === decision.lineId)!;
      if (decision.bindVin) {
        const [busy] = await m.query<{ code: string }[]>(
          `SELECT o.code FROM transport_lines l JOIN transport_orders o ON o.id = l.order_id
           WHERE l.vin = $1 AND l.id <> $2 AND l.status NOT IN ('DELIVERED','CLOSED','CANCELLED')`,
          [vin, line.id],
        );
        if (busy) throw new ConflictException(`VIN ${vin} 已在进行中的需求单 ${busy.code}`);
      }
      await this.access.assertNotInYard(m, vin);
      await this.pick(m, a, trip, line, vin, d.photoKeys ?? [], d.latitude, d.longitude, a.user.userId);
      return { result: 'PICKED', line: await this.lineView(m, line.id) };
    });
  }

  /** 启运：未装上的明细退回“已分配”，不阻塞发车；计划外 VIN 必须先处理。 */
  async depart(a: Actor, tripId: string) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'EXECUTE', true);
      if (trip.status === 'IN_TRANSIT') return { ok: true, returned: 0 };
      this.requireLoadable(trip);
      this.requireAssigned(trip);
      const [{ open }] = await m.query<{ open: number }[]>(
        `SELECT count(*)::int open FROM transport_exceptions WHERE trip_id = $1 AND type = 'UNPLANNED_VIN' AND status = 'OPEN'`,
        [tripId],
      );
      if (open) throw new BadRequestException(`还有 ${open} 台计划外车辆待内部处理，处理后才能发车`);
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND status IN ('DISPATCHED','PICKED_UP') FOR UPDATE`,
        [tripId],
      );
      const loaded = lines.filter((l) => l.status === 'PICKED_UP');
      if (!loaded.length) throw new BadRequestException('还没有扫码装车的车辆');
      const notLoaded = lines.filter((l) => l.status === 'DISPATCHED');
      await this.release(m, a, trip, notLoaded, 'LINE_NOT_LOADED', '启运时未装车');
      await m.query(
        `UPDATE transport_lines SET status = 'IN_TRANSIT', updated_at = now() WHERE id = ANY($1::uuid[])`,
        [loaded.map((l) => l.id)],
      );
      await m.query(`UPDATE transport_trips SET status = 'IN_TRANSIT', departed_at = now() WHERE id = $1`, [tripId]);
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        tripId,
        action: 'TRIP_DEPARTED',
        payload: { loaded: loaded.length, returned: notLoaded.length },
      });
      return { ok: true, returned: notLoaded.length };
    });
  }

  async sign(a: Actor, tripId: string, d: SignScanDto) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'EXECUTE', true);
      const vin = normalizeTransportVin(d.vin);
      const [line] = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND vin = $2 AND status <> 'CANCELLED' FOR UPDATE`,
        [tripId, vin],
      );
      if (!line) throw new BadRequestException(`VIN ${vin} 不在本趟次`);
      if (line.status === 'DELIVERED') return { result: 'DELIVERED', line: await this.lineView(m, line.id) };
      if (trip.status !== 'IN_TRANSIT' || line.status !== 'IN_TRANSIT')
        throw new BadRequestException('请先确认发车再签收');
      const [saved] = await this.access.rows<LineRow>(
        m,
        `UPDATE transport_lines SET status = 'DELIVERED', delivered_at = now(), delivered_by = $1, delivery_photos = $2,
           updated_at = now() WHERE id = $3 RETURNING *`,
        [a.user.userId, JSON.stringify(d.photoKeys ?? []), line.id],
      );
      await this.finance.createChargesForLine(m, saved, trip);
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        orderId: line.order_id,
        tripId,
        lineId: line.id,
        vin,
        action: 'LINE_DELIVERED',
      });
      await this.completeIfDone(m, a, trip);
      await this.orders.refreshOrders(m, [line.order_id]);
      return { result: 'DELIVERED', line: await this.lineView(m, line.id) };
    });
  }

  /**
   * 强制提货：司机没用 App 时由内部人员补录。只能选“待提货”的明细，必须有 VIN、必须写原因。
   */
  async forcePickup(a: Actor, tripId: string, d: ForceStatusDto) {
    this.access.requireInternal(a);
    const reason = d.reason.trim();
    if (!reason) throw new BadRequestException('请填写原因');
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      this.requireLoadable(trip);
      this.requireAssigned(trip);
      await this.assertTrailerFree(m, trip);
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND id = ANY($2::uuid[]) ORDER BY line_no FOR UPDATE`,
        [tripId, d.lineIds],
      );
      if (lines.length !== new Set(d.lineIds).size) throw new NotFoundException('部分明细不在本趟次');
      for (const line of lines) {
        if (line.status !== 'DISPATCHED')
          throw new BadRequestException(`第 ${line.line_no} 行不是待提货状态`);
        if (!line.vin)
          throw new BadRequestException(`第 ${line.line_no} 行还没有 VIN，请先补 VIN 再强制提货`);
      }
      for (const line of lines) {
        await this.access.assertNotInYard(m, line.vin!);
        await this.pick(m, a, trip, line, line.vin!, d.photoKeys ?? [], null, null, a.user.userId);
        await this.access.event(m, a, {
          organizationId: trip.organization_id,
          orderId: line.order_id,
          tripId,
          lineId: line.id,
          vin: line.vin,
          action: 'LINE_FORCE_PICKED_UP',
          reason,
          payload: { photos: d.photoKeys ?? [] },
        });
      }
      return { updated: lines.length };
    });
  }

  /** 强制签收：只能选“运输中”的明细，必须写原因；费用照常生成。 */
  async forceSign(a: Actor, tripId: string, d: ForceStatusDto) {
    this.access.requireInternal(a);
    const reason = d.reason.trim();
    if (!reason) throw new BadRequestException('请填写原因');
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'MANAGE', true);
      if (trip.status !== 'IN_TRANSIT') throw new BadRequestException('趟次还没发车');
      const lines = await m.query<LineRow[]>(
        `SELECT * FROM transport_lines WHERE trip_id = $1 AND id = ANY($2::uuid[]) ORDER BY line_no FOR UPDATE`,
        [tripId, d.lineIds],
      );
      if (lines.length !== new Set(d.lineIds).size) throw new NotFoundException('部分明细不在本趟次');
      for (const line of lines)
        if (line.status !== 'IN_TRANSIT')
          throw new BadRequestException(`第 ${line.line_no} 行不是运输中状态`);
      const orderIds: string[] = [];
      for (const line of lines) {
        const [saved] = await this.access.rows<LineRow>(
          m,
          `UPDATE transport_lines SET status = 'DELIVERED', delivered_at = now(), delivered_by = $1,
             delivery_photos = $2, updated_at = now() WHERE id = $3 RETURNING *`,
          [a.user.userId, JSON.stringify(d.photoKeys ?? []), line.id],
        );
        await this.finance.createChargesForLine(m, saved, trip);
        await this.access.event(m, a, {
          organizationId: trip.organization_id,
          orderId: line.order_id,
          tripId,
          lineId: line.id,
          vin: line.vin,
          action: 'LINE_FORCE_DELIVERED',
          reason,
          payload: { photos: d.photoKeys ?? [] },
        });
        orderIds.push(line.order_id);
      }
      await this.completeIfDone(m, a, trip);
      await this.orders.refreshOrders(m, orderIds);
      return { updated: lines.length };
    });
  }

  /** 拒收 / 退回等无法签收的车，内部关闭后趟次才能完成。 */
  async closeLine(a: Actor, lineId: string, reason: string) {
    this.access.requireInternal(a);
    reason = reason.trim();
    if (!reason) throw new BadRequestException('请填写关闭原因');
    return this.access.tx(async (m) => {
      const [line] = await m.query<LineRow[]>('SELECT * FROM transport_lines WHERE id = $1 FOR UPDATE', [lineId]);
      if (!line) throw new NotFoundException('运输明细不存在');
      this.access.requireOrg(a, line.organization_id);
      if (line.status !== 'IN_TRANSIT') throw new BadRequestException('只有运输中的车辆可以关闭');
      const trip = await this.access.trip(m, a, line.trip_id!, 'MANAGE', true);
      await m.query(
        `UPDATE transport_lines SET status = 'CLOSED', end_reason = $1, updated_at = now() WHERE id = $2`,
        [reason, lineId],
      );
      await this.access.event(m, a, {
        organizationId: line.organization_id,
        orderId: line.order_id,
        tripId: trip.id,
        lineId,
        vin: line.vin,
        action: 'LINE_CLOSED',
        reason,
      });
      await this.completeIfDone(m, a, trip);
      await this.orders.refreshOrders(m, [line.order_id]);
      return { ok: true };
    });
  }

  /** 货损、拒收等只做记录，不影响结算。 */
  async recordException(a: Actor, tripId: string, d: RecordExceptionDto) {
    return this.access.tx(async (m) => {
      const trip = await this.access.trip(m, a, tripId, 'EXECUTE', true);
      if (trip.status === 'CANCELLED') throw new BadRequestException('趟次已取消');
      let lineId: string | null = null;
      let vin: string | null = null;
      if (d.vin?.trim()) {
        vin = normalizeTransportVin(d.vin);
        const [line] = await m.query<{ id: string }[]>(
          'SELECT id FROM transport_lines WHERE trip_id = $1 AND vin = $2',
          [tripId, vin],
        );
        if (!line) throw new BadRequestException(`VIN ${vin} 不在本趟次`);
        lineId = line.id;
      }
      const [row] = await m.query<ExceptionRow[]>(
        `INSERT INTO transport_exceptions(organization_id, trip_id, line_id, vin, type, status, note, photos, reported_by)
         VALUES ($1,$2,$3,$4,$5,'RECORDED',$6,$7,$8) RETURNING *`,
        [trip.organization_id, tripId, lineId, vin, d.type, d.note.trim(), JSON.stringify(d.photoKeys ?? []), a.user.userId],
      );
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        tripId,
        lineId,
        vin,
        action: `EXCEPTION_${d.type}`,
        reason: d.note.trim(),
      });
      return row;
    });
  }

  /** 内部处理计划外 VIN：顶替/填入本趟一行、作为追加车辆加到需求单、或驳回。 */
  async resolveException(a: Actor, id: string, d: ResolveExceptionDto) {
    this.access.requireInternal(a);
    const reason = d.reason.trim();
    if (!reason) throw new BadRequestException('请填写处理原因');
    return this.access.tx(async (m) => {
      const [ex] = await m.query<ExceptionRow[]>(
        'SELECT * FROM transport_exceptions WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!ex) throw new NotFoundException('异常记录不存在');
      this.access.requireOrg(a, ex.organization_id);
      if (ex.type !== 'UNPLANNED_VIN' || ex.status !== 'OPEN') throw new BadRequestException('该异常不需要处理');
      const trip = await this.access.trip(m, a, ex.trip_id, 'MANAGE', true);
      this.requireLoadable(trip);
      const vin = ex.vin!;
      let lineId: string | null = null;
      if (d.decision === 'BIND') {
        if (!d.lineId) throw new BadRequestException('请选择要顶替或填入的明细');
        const [line] = await m.query<LineRow[]>(
          `SELECT * FROM transport_lines WHERE id = $1 AND trip_id = $2 AND status = 'DISPATCHED' FOR UPDATE`,
          [d.lineId, trip.id],
        );
        if (!line) throw new BadRequestException('所选明细不在本趟次，或已经装车');
        await this.access.assertNotInYard(m, vin);
        if (line.vin)
          await this.access.event(m, a, {
            organizationId: line.organization_id,
            orderId: line.order_id,
            tripId: trip.id,
            lineId: line.id,
            vin: line.vin,
            action: 'VIN_REPLACED',
            reason,
            payload: { replacedBy: vin },
          });
        await this.pick(m, a, trip, line, vin, ex.photos, null, null, ex.reported_by);
        lineId = line.id;
      } else if (d.decision === 'ADD') {
        if (!d.orderId || !d.originId || !d.destinationId)
          throw new BadRequestException('追加车辆需选择需求单、发货地和收货地');
        const [order] = await m.query<{ id: string; organization_id: string; customer_id: string; status: string }[]>(
          'SELECT id, organization_id, customer_id, status FROM transport_orders WHERE id = $1 FOR UPDATE',
          [d.orderId],
        );
        if (!order) throw new NotFoundException('需求单不存在');
        this.access.requireOrg(a, order.organization_id);
        const places = await m.query<{ id: string }[]>(
          `SELECT id FROM customer_addresses WHERE id = ANY($1::uuid[]) AND customer_id = $2 AND "isActive"`,
          [[d.originId, d.destinationId], order.customer_id],
        );
        if (places.length !== 2 || d.originId === d.destinationId)
          throw new BadRequestException('发货地、收货地必须是该客户的不同地点');
        const [{ n }] = await m.query<{ n: number }[]>(
          `SELECT count(*)::int n FROM transport_lines WHERE trip_id = $1 AND status IN ('DISPATCHED','PICKED_UP')`,
          [trip.id],
        );
        if (n >= trip.capacity) throw new BadRequestException(`该拖车已满（${trip.capacity} 台）`);
        await this.access.assertNotInYard(m, vin);
        const [{ next }] = await m.query<{ next: number }[]>(
          'SELECT COALESCE(max(line_no), 0) + 1 next FROM transport_lines WHERE order_id = $1',
          [order.id],
        );
        const [line] = await m.query<LineRow[]>(
          `INSERT INTO transport_lines(order_id, organization_id, customer_id, line_no, vin, origin_id, destination_id,
             tow_type, carrier_id, trip_id, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DISPATCHED') RETURNING *`,
          [order.id, order.organization_id, order.customer_id, next, vin, d.originId, d.destinationId,
            trip.tow_type, trip.carrier_id, trip.id],
        );
        await this.pick(m, a, trip, line, vin, ex.photos, null, null, ex.reported_by);
        await this.access.event(m, a, {
          organizationId: order.organization_id,
          orderId: order.id,
          tripId: trip.id,
          lineId: line.id,
          vin,
          action: 'LINE_ADDED_FROM_SCAN',
          reason,
        });
        await this.orders.refreshOrders(m, [order.id]);
        lineId = line.id;
      }
      await m.query(
        `UPDATE transport_exceptions SET status = 'RESOLVED', resolution = $1, resolution_reason = $2, line_id = $3,
           resolved_by = $4, resolved_at = now() WHERE id = $5`,
        [d.decision, reason, lineId, a.user.userId, id],
      );
      await this.access.event(m, a, {
        organizationId: ex.organization_id,
        tripId: trip.id,
        lineId,
        vin,
        action: 'UNPLANNED_VIN_RESOLVED',
        reason,
        payload: { decision: d.decision },
      });
      return { ok: true };
    });
  }

  async assertCanUpload(a: Actor, tripId: string, originId: string, destinationId: string) {
    const trip = await this.access.trip(this.db.manager, a, tripId, 'EXECUTE');
    if (trip.status === 'CANCELLED') throw new BadRequestException('趟次已取消');
    const [leg] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM transport_lines WHERE trip_id = $1 AND origin_id = $2 AND destination_id = $3
         AND status = ANY($4::varchar[]) LIMIT 1`,
      [tripId, originId, destinationId, ON_TRUCK],
    );
    if (!leg) throw new BadRequestException('本趟次没有这一段（起点→终点）');
    return trip;
  }

  async addDocument(
    a: Actor,
    tripId: string,
    originId: string,
    destinationId: string,
    file: { key: string; name: string; mime: string },
  ) {
    const trip = await this.assertCanUpload(a, tripId, originId, destinationId);
    return this.access.tx(async (m) => {
      const [doc] = await m.query(
        `INSERT INTO transport_documents(trip_id, origin_id, destination_id, file_key, file_name, mime_type, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tripId, originId, destinationId, file.key, file.name, file.mime, a.user.userId],
      );
      await this.access.event(m, a, {
        organizationId: trip.organization_id,
        tripId,
        action: 'POD_UPLOADED',
        payload: { originId, destinationId, fileName: file.name },
      });
      return doc;
    });
  }

  // ------------------------------------------------------------------ 工具
  /**
   * 09.30 反馈：允许同一拖车/司机提前排多趟，但同一辆拖车只要还有“已装车未签收”的车，
   * 就不能给别的趟次装车。派车时不拦（界面给黄色提示），装车时在这里真正拦住。
   */
  private async assertTrailerFree(m: EntityManager, trip: TripRow) {
    const [busy] = await m.query<{ code: string; loaded: number }[]>(
      `SELECT t.code, count(l.id)::int loaded
       FROM transport_trips t JOIN transport_lines l ON l.trip_id = t.id
       WHERE t.vehicle_id = $1 AND t.id <> $2 AND t.status IN ('LOADING','IN_TRANSIT')
         AND l.status IN ('PICKED_UP','IN_TRANSIT')
       GROUP BY t.code LIMIT 1`,
      [trip.vehicle_id, trip.id],
    );
    if (busy)
      throw new ConflictException(
        `该拖车在趟次 ${busy.code} 还有 ${busy.loaded} 台已装车未签收的车辆，签收完成后才能装本趟`,
      );
  }

  private requireLoadable(trip: TripRow) {
    if (!LOADABLE.includes(trip.status)) throw new BadRequestException('该趟次已发车或已结束，不能再装车');
  }

  private async markLoading(m: EntityManager, trip: TripRow) {
    if (trip.status === 'PLANNED')
      await m.query(`UPDATE transport_trips SET status = 'LOADING' WHERE id = $1`, [trip.id]);
  }

  private async pick(
    m: EntityManager,
    a: Actor,
    trip: TripRow,
    line: LineRow,
    vin: string,
    photos: string[],
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    pickedBy: string,
  ) {
    await m.query(
      `UPDATE transport_lines SET vin = $1, status = 'PICKED_UP', picked_up_at = now(), picked_up_by = $2,
         pickup_photos = $3, pickup_latitude = $4, pickup_longitude = $5, updated_at = now()
       WHERE id = $6`,
      [vin, pickedBy, JSON.stringify(photos), latitude ?? null, longitude ?? null, line.id],
    );
    await this.markLoading(m, trip);
    await this.access.event(m, a, {
      organizationId: trip.organization_id,
      orderId: line.order_id,
      tripId: trip.id,
      lineId: line.id,
      vin,
      action: 'LINE_PICKED_UP',
      payload: line.vin ? {} : { boundVin: true },
    });
  }

  private async lockAssignable(
    m: EntityManager,
    a: Actor,
    ids: string[],
    carrierId: string,
    towType: TowType,
  ): Promise<LineRow[]> {
    const unique = [...new Set(ids)];
    const lines = await m.query<LineRow[]>(
      'SELECT * FROM transport_lines WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [unique],
    );
    if (lines.length !== unique.length) throw new NotFoundException('部分明细不存在');
    for (const l of lines) {
      if (a.internal) this.access.requireOrg(a, l.organization_id);
      if (l.status !== 'ALLOCATED' || l.carrier_id !== carrierId)
        throw new BadRequestException(`需求单明细第 ${l.line_no} 行未分配给该物流商或已派车`);
      if (l.tow_type !== towType)
        throw new BadRequestException(`第 ${l.line_no} 行要求 ${l.tow_type ?? '未指定'}，与拖车类型 ${towType} 不一致`);
    }
    return lines;
  }

  private async attach(m: EntityManager, a: Actor, trip: TripRow, lines: LineRow[]) {
    await m.query(
      `UPDATE transport_lines SET trip_id = $1, status = 'DISPATCHED', updated_at = now() WHERE id = ANY($2::uuid[])`,
      [trip.id, lines.map((l) => l.id)],
    );
    for (const l of lines)
      await this.access.event(m, a, {
        organizationId: l.organization_id,
        orderId: l.order_id,
        tripId: trip.id,
        lineId: l.id,
        vin: l.vin,
        action: 'LINE_DISPATCHED',
      });
  }

  private async release(
    m: EntityManager,
    a: Actor,
    trip: TripRow,
    lines: LineRow[],
    action: string,
    reason: string,
  ) {
    if (!lines.length) return;
    await m.query(
      `UPDATE transport_lines SET trip_id = NULL, status = 'ALLOCATED', picked_up_at = NULL, picked_up_by = NULL,
         pickup_photos = '[]', pickup_latitude = NULL, pickup_longitude = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [lines.map((l) => l.id)],
    );
    for (const l of lines)
      await this.access.event(m, a, {
        organizationId: l.organization_id,
        orderId: l.order_id,
        tripId: trip.id,
        lineId: l.id,
        vin: l.vin,
        action,
        reason,
      });
  }

  private async completeIfDone(m: EntityManager, a: Actor, trip: TripRow) {
    const rows = await m.query<{ status: string }[]>(
      'SELECT status FROM transport_lines WHERE trip_id = $1',
      [trip.id],
    );
    if (!tripCanComplete(rows.map((r) => r.status))) return;
    await m.query(
      `UPDATE transport_trips SET status = 'COMPLETED', completed_at = now() WHERE id = $1 AND status = 'IN_TRANSIT'`,
      [trip.id],
    );
    await this.access.event(m, a, {
      organizationId: trip.organization_id,
      tripId: trip.id,
      action: 'TRIP_COMPLETED',
    });
  }

  private async lineView(m: EntityManager, id: string) {
    const [line] = await m.query(`${LINE_SELECT} WHERE l.id = $1`, [id]);
    return line;
  }
}
