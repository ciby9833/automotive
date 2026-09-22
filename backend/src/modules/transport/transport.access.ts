import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ScopeService } from '../../common/scope/scope.service';
import { EffectiveScope } from '../../common/scope/scope.types';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/auth.types';
import { TripRow } from './transport.rows';

/**
 * 纯运输的操作者：
 *  - 内部（HQ_ADMIN / ORG_ADMIN）：本机构及子机构全部数据，可建单、分配、派车、处理异常、维护报价；
 *  - 承运商业务员：分配给本承运商的明细和趟次，可派车、执行；
 *  - 司机：本承运商的趟次；账号绑定了司机档案时只看派给自己的；
 *  - 客户：只读自己的需求单。
 */
export interface Actor {
  user: AuthenticatedUser;
  scope: EffectiveScope;
  internal: boolean;
  orgIds: string[];
  carrierId: string | null;
  driverId: string | null;
  customerId: string | null;
  carrierStaff: boolean;
  driver: boolean;
}

export type TripRight = 'READ' | 'EXECUTE' | 'MANAGE';

const CONSTRAINT_MESSAGES: Record<string, string> = {
  transport_lines_active_vin: 'VIN 已在其他进行中的运输明细里',
  transport_trips_active_vehicle: '该拖车还有未完成的趟次',
  transport_trips_active_driver: '该司机还有未完成的趟次',
  transport_orders_customer_id_customer_request_no_key: '该客户订单号已存在',
  transport_exceptions_open_vin: '该 VIN 已登记为待处理的计划外车辆',
};

@Injectable()
export class TransportAccess {
  constructor(
    readonly db: DataSource,
    private readonly scopes: ScopeService,
  ) {}

  async actor(user: AuthenticatedUser): Promise<Actor> {
    const scope = await this.scopes.resolve(user);
    if (scope.type === 'ORG') {
      if (![Role.HQ_ADMIN, Role.ORG_ADMIN].includes(scope.role))
        throw new ForbiddenException('需要机构管理员权限');
      return {
        user,
        scope,
        internal: true,
        orgIds: scope.orgIds,
        carrierId: null,
        driverId: null,
        customerId: null,
        carrierStaff: false,
        driver: false,
      };
    }
    if (scope.type === 'CARRIER') {
      let driverId: string | null = null;
      if (scope.role === Role.CARRIER_DRIVER) {
        const [row] = await this.db.query<{ driver_id: string | null }[]>(
          'SELECT driver_id FROM users WHERE id=$1',
          [user.userId],
        );
        driverId = row?.driver_id ?? null;
      }
      return {
        user,
        scope,
        internal: false,
        orgIds: [],
        carrierId: scope.carrierId,
        driverId,
        customerId: null,
        carrierStaff: scope.role === Role.CARRIER_STAFF,
        driver: scope.role === Role.CARRIER_DRIVER,
      };
    }
    return {
      user,
      scope,
      internal: false,
      orgIds: [],
      carrierId: null,
      driverId: null,
      customerId: scope.customerId,
      carrierStaff: false,
      driver: false,
    };
  }

  requireInternal(a: Actor): void {
    if (!a.internal) throw new ForbiddenException('需要机构管理员权限');
  }

  requireOrg(a: Actor, organizationId: string): void {
    if (!a.internal || !a.orgIds.includes(organizationId))
      throw new ForbiddenException('不在当前机构范围内');
  }

  /** 趟次可见性 SQL 片段；args 会被追加参数。 */
  tripFilter(a: Actor, alias: string, args: unknown[]): string {
    if (a.internal) {
      args.push(a.orgIds);
      return `${alias}.organization_id = ANY($${args.length}::uuid[])`;
    }
    if (a.carrierId) {
      args.push(a.carrierId);
      let sql = `${alias}.carrier_id = $${args.length}`;
      if (a.driver && a.driverId) {
        args.push(a.driverId);
        sql += ` AND ${alias}.driver_id = $${args.length}`;
      }
      return sql;
    }
    args.push(a.customerId);
    return `EXISTS (SELECT 1 FROM transport_lines cl WHERE cl.trip_id = ${alias}.id AND cl.customer_id = $${args.length})`;
  }

  /** 明细 / 需求单可见性（承运商只看分配给自己的明细；司机不直接看明细池）。 */
  lineFilter(a: Actor, alias: string, args: unknown[]): string {
    if (a.internal) {
      args.push(a.orgIds);
      return `${alias}.organization_id = ANY($${args.length}::uuid[])`;
    }
    if (a.customerId) {
      args.push(a.customerId);
      return `${alias}.customer_id = $${args.length}`;
    }
    if (a.carrierStaff && a.carrierId) {
      args.push(a.carrierId);
      return `${alias}.carrier_id = $${args.length}`;
    }
    throw new ForbiddenException('无权查看运输明细');
  }

  orderFilter(a: Actor, alias: string, args: unknown[]): string {
    if (a.internal) {
      args.push(a.orgIds);
      return `${alias}.organization_id = ANY($${args.length}::uuid[])`;
    }
    if (a.customerId) {
      args.push(a.customerId);
      return `${alias}.customer_id = $${args.length}`;
    }
    throw new ForbiddenException('无权查看运输需求单');
  }

  async trip(
    m: EntityManager,
    a: Actor,
    id: string,
    right: TripRight,
    lock = false,
  ): Promise<TripRow> {
    const [trip] = await m.query<TripRow[]>(
      `SELECT * FROM transport_trips WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!trip) throw new NotFoundException('趟次不存在');
    if (a.internal) {
      this.requireOrg(a, trip.organization_id);
      return trip;
    }
    if (a.carrierId && trip.carrier_id === a.carrierId) {
      if (a.driver) {
        if (a.driverId && trip.driver_id !== a.driverId)
          throw new ForbiddenException('该趟次没有派给你');
        if (right === 'MANAGE')
          throw new ForbiddenException('司机账号不能调整派车');
      }
      return trip;
    }
    if (a.customerId && right === 'READ') {
      const [own] = await m.query<{ id: string }[]>(
        'SELECT id FROM transport_lines WHERE trip_id = $1 AND customer_id = $2 LIMIT 1',
        [id, a.customerId],
      );
      if (own) return trip;
    }
    throw new ForbiddenException('无权操作该趟次');
  }

  async event(
    m: EntityManager,
    a: Actor,
    e: {
      organizationId: string;
      action: string;
      orderId?: string | null;
      tripId?: string | null;
      lineId?: string | null;
      vin?: string | null;
      reason?: string;
      payload?: object;
    },
  ): Promise<void> {
    await m.query(
      `INSERT INTO transport_events(organization_id, order_id, trip_id, line_id, vin, action, reason, payload, operator_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        e.organizationId,
        e.orderId ?? null,
        e.tripId ?? null,
        e.lineId ?? null,
        e.vin ?? null,
        e.action,
        e.reason ?? '',
        JSON.stringify(e.payload ?? {}),
        a.user.userId,
      ],
    );
  }

  /** TypeORM 对 UPDATE/DELETE ... RETURNING 返回 [rows, rowCount]；统一成行数组。 */
  async rows<T>(m: EntityManager, sql: string, args: unknown[]): Promise<T[]> {
    const result: unknown = await m.query(sql, args);
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === 'number'
    )
      return result[0] as T[];
    return result as T[];
  }

  async tx<T>(run: (m: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(run);
    } catch (e) {
      const err = e as {
        code?: string;
        constraint?: string;
        message?: string;
        driverError?: { code?: string; constraint?: string; message?: string };
      };
      const code = err.driverError?.code ?? err.code;
      if (code === '23505') {
        const constraint = err.driverError?.constraint ?? err.constraint ?? '';
        const text = err.driverError?.message ?? err.message ?? '';
        if (CONSTRAINT_MESSAGES[constraint])
          throw new ConflictException(CONSTRAINT_MESSAGES[constraint]);
        if (text.includes('yard waybill'))
          throw new ConflictException('VIN 已在场地运单中，不能同时做纯运输');
        if (text.includes('transport line'))
          throw new ConflictException('VIN 已在进行中的纯运输明细里');
        throw new ConflictException('数据已被占用，请刷新后重试');
      }
      throw e;
    }
  }

  /** 场地在库车辆必须走出库流程，不能被纯运输直接提走。 */
  async assertNotInYard(m: EntityManager, vin: string): Promise<void> {
    const [stock] = await m.query<{ id: string }[]>(
      `SELECT id FROM yard_slots WHERE upper(trim(current_vin)) = $1 AND status = 'OCCUPIED' LIMIT 1`,
      [vin],
    );
    if (stock)
      throw new ConflictException(`VIN ${vin} 在场地库存中，请走出库流程`);
  }
}
