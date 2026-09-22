import { DataSource } from 'typeorm';
import { createServer, Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { io, Socket } from '../../frontend/node_modules/socket.io-client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppDataSource } from '../src/database/data-source';
import { OperationalUpdatesService } from '../src/modules/operational-updates/operational-updates.service';
import { OperationalUpdatesGateway } from '../src/modules/operational-updates/operational-updates.gateway';
import { ScopeService } from '../src/common/scope/scope.service';
import { Permission } from '../src/common/enums/permission.enum';
import { Role } from '../src/common/enums/role.enum';
import { Organization } from '../src/modules/organizations/entities/organization.entity';
import { Yard } from '../src/modules/yards/entities/yard.entity';
import { YardZone } from '../src/modules/yards/entities/yard-zone.entity';
import { YardSlot } from '../src/modules/yards/entities/yard-slot.entity';
import { Currency } from '../src/common/enums/currency.enum';

const database = process.env.OPERATIONS_TEST_DB;
if (database && !/^alms_inventory_test_\d+$/.test(database))
  throw new Error('Use a disposable inventory test database');
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
(database ? describe : describe.skip)(
  'committed operational updates (PostgreSQL + WebSocket)',
  () => {
    let db: DataSource,
      updates: OperationalUpdatesService,
      second: OperationalUpdatesService;
    let http: HttpServer,
      server: Server,
      gateway: OperationalUpdatesGateway,
      url: string;
    let org: Organization, yard: Yard, slot: YardSlot, zone: YardZone;
    const jwt = new JwtService({ secret: 'operational-test-only' });
    const sockets: Socket[] = [];
    const token = (
      organizationId = org.id,
      permission = Permission.YARD_VIEW_BOARD,
    ) =>
      jwt.sign(
        { sub: randomUUID(), activeOrgId: organizationId, permission },
        { expiresIn: '5m' },
      );
    const connect = (auth: Record<string, unknown>) => {
      const client = io(`${url}/operational-updates`, {
        transports: ['websocket'],
        auth,
        reconnection: false,
      });
      sockets.push(client);
      return new Promise<Socket>((resolve, reject) => {
        client.once('connect', () => resolve(client));
        client.once('connect_error', reject);
      });
    };
    beforeAll(async () => {
      db = new DataSource({
        ...AppDataSource.options,
        database,
        logging: false,
        synchronize: false,
      });
      await db.initialize();
      org = await db.getRepository(Organization).save({
        code: randomUUID(),
        name: 'Live update test',
        defaultCurrency: Currency.IDR,
      });
      await db.query(
        `INSERT INTO organization_operating_policies(organization_id,snapshot_enabled,timezone,business_day_cutoff,snapshot_started_at,
      long_stay_days,lock_timeout_hours,utilization_warning_percent,utilization_critical_percent,expected_arrival_warning_hours)
      VALUES($1,true,'Asia/Jakarta','00:00',NOW(),7,24,80,95,24)`,
        [org.id],
      );
      yard = await db.getRepository(Yard).save({
        organizationId: org.id,
        code: randomUUID(),
        name: 'Test yard',
      });
      zone = await db
        .getRepository(YardZone)
        .save({ yardId: yard.id, code: 'P', lineCount: 1, rowCount: 1 });
      slot = await db
        .getRepository(YardSlot)
        .save({ yardId: yard.id, zoneId: zone.id, line: 1, row: 1 });
      updates = new OperationalUpdatesService(db);
      let ready = once(updates.events, 'reset');
      updates.onModuleInit();
      await ready;
      second = new OperationalUpdatesService(db);
      ready = once(second.events, 'reset');
      second.onModuleInit();
      await ready;
      http = createServer();
      server = new Server(http, { transports: ['websocket'] });
      const namespace = server.of('/operational-updates');
      const scopes = {
        authenticate: async (payload) => ({
          preAuth: false,
          permissions: [payload.permission],
          activeOrgId: payload.activeOrgId,
        }),
        resolve: async (user) => ({
          type: 'ORG',
          activeOrgId: user.activeOrgId,
          orgIds: [user.activeOrgId],
          role: Role.ORG_ADMIN,
          scopeYardId: null,
        }),
      } as unknown as ScopeService;
      gateway = new OperationalUpdatesGateway(
        updates,
        scopes,
        jwt,
        { get: () => 'operational-test-only' } as unknown as ConfigService,
        db,
      );
      gateway.server = namespace;
      gateway.afterInit(namespace);
      await new Promise<void>((resolve) =>
        http.listen(0, '127.0.0.1', resolve),
      );
      url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    });
    afterEach(async () => {
      sockets.splice(0).forEach((s) => s.disconnect());
      await pause(120);
    });
    afterAll(async () => {
      gateway?.onModuleDestroy();
      await updates?.onModuleDestroy();
      await second?.onModuleDestroy();
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      if (db?.isInitialized) await db.destroy();
    });
    it('delivers one committed invalidation to viewers and every backend listener, with no business payload', async () => {
      const client = await connect({
        token: token(),
        view: 'board',
        yardId: yard.id,
      });
      const received = jest.fn();
      client.on('changed', received);
      const otherProcess = jest.fn();
      second.events.on('change', otherProcess);
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        for (let i = 0; i < 20; i++)
          await runner.manager.update(YardSlot, slot.id, {
            isLocked: i % 2 === 0,
          });
        await pause(150);
        expect(received).not.toHaveBeenCalled();
        expect(otherProcess).not.toHaveBeenCalled();
        const done = once(client, 'changed');
        await runner.commitTransaction();
        await done;
        await pause(150);
        expect(received).toHaveBeenCalledTimes(1);
        expect(received).toHaveBeenCalledWith();
        expect(otherProcess).toHaveBeenCalledTimes(1);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        second.events.off('change', otherProcess);
      }
    });
    it('never publishes a rolled-back slot mutation', async () => {
      const client = await connect({
        token: token(),
        view: 'board',
        yardId: yard.id,
      });
      const received = jest.fn();
      client.on('changed', received);
      await expect(
        db.transaction(async (mgr) => {
          await mgr.update(YardSlot, slot.id, { isLocked: true });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      await pause(250);
      expect(received).not.toHaveBeenCalled();
    });
    it('covers zone capacity and policy edits as well as inventory operations', async () => {
      const client = await connect({
        token: token(),
        view: 'board',
        yardId: yard.id,
      });
      let changed = once(client, 'changed');
      await db.getRepository(YardZone).update(zone.id, { rowCount: 2 });
      await changed;
      changed = once(client, 'changed');
      await db.query(
        'UPDATE organization_operating_policies SET long_stay_days=long_stay_days+1 WHERE organization_id=$1',
        [org.id],
      );
      await changed;
    });
    it('isolates subscriptions and rejects missing permissions and cross-organization yard access', async () => {
      await expect(
        connect({ token: token(randomUUID()), view: 'board', yardId: yard.id }),
      ).rejects.toThrow('Forbidden');
      await expect(
        connect({
          token: token(org.id, Permission.WAYBILL_VIEW),
          view: 'board',
          yardId: yard.id,
        }),
      ).rejects.toThrow('Forbidden');
      const outside = await connect({
        token: token(randomUUID()),
        view: 'dashboard',
      });
      const received = jest.fn();
      outside.on('changed', received);
      await db.getRepository(YardZone).update(zone.id, { rowCount: 3 });
      await pause(250);
      expect(received).not.toHaveBeenCalled();
    });
    it('refreshes a selected-yard dashboard for same-organization comparison changes without waking the yard board', async () => {
      const otherYard = await db.getRepository(Yard).save({
        organizationId: org.id,
        code: randomUUID(),
        name: 'Comparison yard',
      });
      await pause(150);
      const board = await connect({
        token: token(),
        view: 'board',
        yardId: yard.id,
      });
      const dashboard = await connect({
        token: token(),
        view: 'dashboard',
        yardId: yard.id,
      });
      const boardChanged = jest.fn();
      board.on('changed', boardChanged);
      const changed = once(dashboard, 'changed');
      await db
        .getRepository(YardZone)
        .save({ yardId: otherYard.id, code: 'P', lineCount: 1, rowCount: 1 });
      await changed;
      await pause(150);
      expect(boardChanged).not.toHaveBeenCalled();
    });
    it('reconnects the database listener and tells connected pages to resync after a notification gap', async () => {
      const client = await connect({
        token: token(),
        view: 'board',
        yardId: yard.id,
      });
      const reset = once(updates.events, 'reset');
      const changed = once(client, 'changed');
      const [listener] = await db.query(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name='alms-operational-listener' ORDER BY backend_start LIMIT 1",
      );
      await db.query('SELECT pg_terminate_backend($1)', [listener.pid]);
      await reset;
      await changed;
    });
  },
);
