/* Supertest response bodies are untyped; these HTTP contract assertions intentionally inspect the raw JSON. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Test } from '@nestjs/testing';
import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import configuration from '../src/config/configuration';
import { AuthModule } from '../src/modules/auth/auth.module';
import { OrganizationsModule } from '../src/modules/organizations/organizations.module';
import { ScopeModule } from '../src/common/scope/scope.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { Organization } from '../src/modules/organizations/entities/organization.entity';
import { OrganizationOperatingPolicy } from '../src/modules/organizations/entities/organization-operating-policy.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserOrganizationMembership } from '../src/modules/users/entities/user-organization-membership.entity';
import { Yard } from '../src/modules/yards/entities/yard.entity';
import { Currency } from '../src/common/enums/currency.enum';
import { Role } from '../src/common/enums/role.enum';
import { YardsModule } from '../src/modules/yards/yards.module';
import { CustomersModule } from '../src/modules/customers/customers.module';
import { CarriersModule } from '../src/modules/carriers/carriers.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PreAuthBlockGuard } from '../src/common/guards/preauth-block.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

// Supply a schema-only disposable database. Never seed or reset the development DB.
config({ quiet: true });
const database = process.env.ORG_TEST_DB;
const suite = database ? describe : describe.skip;
if (database && !/^alms_org_test_\d+$/.test(database))
  throw new Error(
    'ORG_TEST_DB must be a disposable alms_org_test_<timestamp> database',
  );

suite('HQ organization maintenance (real PostgreSQL + HTTP)', () => {
  let app: INestApplication;
  let db: DataSource;
  let root: Organization;
  let branch: Organization;
  let admin: User;
  let hqToken: string;
  let orgToken: string;
  let emptyId: string;
  const password = 'Organization-Test-Only-42!';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database,
          entities: [__dirname + '/../src/modules/**/*.entity.ts'],
          synchronize: false,
        }),
        ScopeModule,
        OrganizationsModule,
        AuthModule,
        YardsModule,
        CustomersModule,
        CarriersModule,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalGuards(
      new PreAuthBlockGuard(app.get(Reflector)),
      new PermissionsGuard(app.get(Reflector)),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
      new TransformInterceptor(),
    );
    // Keep one HTTP listener across concurrent requests instead of letting
    // Supertest repeatedly start/close the same server around each assertion.
    await app.listen(0, '127.0.0.1');
    db = app.get(DataSource);
    root = await db.getRepository(Organization).save({
      code: 'HQ',
      name: 'HQ',
      parentId: null,
      defaultCurrency: Currency.IDR,
    });
    branch = await db.getRepository(Organization).save({
      code: 'ID',
      name: 'Indonesia',
      parentId: root.id,
      defaultCurrency: Currency.IDR,
    });
    for (const org of [root, branch])
      await db.getRepository(OrganizationOperatingPolicy).save({
        organizationId: org.id,
        timezone: 'Asia/Jakarta',
        businessDayCutoff: '02:00:00',
        snapshotEnabled: true,
        snapshotStartedAt: new Date(),
        longStayDays: 7,
        lockTimeoutHours: 24,
        utilizationWarningPercent: 80,
        utilizationCriticalPercent: 90,
        expectedArrivalWarningHours: 24,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    for (const [username, role, org] of [
      ['hq_test', Role.HQ_ADMIN, root],
      ['org_test', Role.ORG_ADMIN, branch],
    ] as const) {
      const user = await db.getRepository(User).save({
        username,
        role,
        displayName: username,
        passwordHash: await bcrypt.hash(password, 4),
      });
      if (role === Role.HQ_ADMIN) admin = user;
      await db
        .getRepository(UserOrganizationMembership)
        .save({ userId: user.id, organizationId: org.id, role });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(201);
      if (role === Role.HQ_ADMIN) hqToken = login.body.data.accessToken;
      else orgToken = login.body.data.accessToken;
    }
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });
  const payload = (code: string, parentId?: string) => ({
    code,
    name: 'Test organization',
    parentId: parentId ?? root.id,
    defaultCurrency: 'IDR',
    timezone: 'Asia/Jakarta',
    businessDayCutoff: '02:00:00',
  });
  const post = (data: object, token = hqToken) =>
    request(app.getHttpServer())
      .post('/organizations')
      .auth(token, { type: 'bearer' })
      .send(data);
  const patch = (id: string, data: object) =>
    request(app.getHttpServer())
      .patch(`/organizations/${id}`)
      .auth(hqToken, { type: 'bearer' })
      .send(data);
  const policy = (id: string, data: object) =>
    request(app.getHttpServer())
      .patch(`/organizations/${id}/operating-policy`)
      .auth(hqToken, { type: 'bearer' })
      .send(data);
  const status = (id: string, isActive: boolean) =>
    request(app.getHttpServer())
      .patch(`/organizations/${id}/status`)
      .auth(hqToken, { type: 'bearer' })
      .send({ isActive });
  const list = (path: string, token = hqToken) =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });

  it('rejects unauthenticated and non-HQ management; retains scoped business lists', async () => {
    await request(app.getHttpServer())
      .get('/organizations/management')
      .expect(401);
    await list('/organizations/management', orgToken).expect(403);
    await post(payload('NO_AUTH'), orgToken).expect(403);
    await request(app.getHttpServer())
      .patch(`/organizations/${branch.id}`)
      .auth(orgToken, { type: 'bearer' })
      .send({ name: 'No' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/organizations/${branch.id}/status`)
      .auth(orgToken, { type: 'bearer' })
      .send({ isActive: false })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/organizations/${branch.id}/operating-policy`)
      .auth(orgToken, { type: 'bearer' })
      .send({ longStayDays: 8 })
      .expect(403);
    const rows = await list('/organizations', orgToken).expect(200);
    expect(rows.body.data.map((o: Organization) => o.id)).toEqual([branch.id]);
  });

  it('creates organization + inherited operating policy and normalizes code', async () => {
    const res = await post(payload(' test ')).expect(201);
    emptyId = res.body.data.id;
    expect(res.body.data).toMatchObject({
      code: 'TEST',
      parentId: root.id,
      isActive: true,
      operatingPolicy: {
        timezone: 'Asia/Jakarta',
        businessDayCutoff: '02:00:00',
        longStayDays: 7,
      },
    });
    const rows = await list('/organizations', orgToken).expect(200);
    expect(rows.body.data.some((o: Organization) => o.id === emptyId)).toBe(
      false,
    );
  });

  it('rejects duplicates including case variants and concurrent submissions', async () => {
    await post(payload('test')).expect(409);
    const res = await Promise.all([
      post(payload('RACE')),
      post(payload('race')),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('rejects missing parent, blanks, invalid currency, timezone and cutoff', async () => {
    for (const invalid of [
      { parentId: undefined },
      { parentId: null },
      { name: '  ' },
      { code: 'a b' },
      { timezone: ' ' },
      { timezone: 'Mars/Test' },
      { businessDayCutoff: '24:00' },
      { defaultCurrency: 'USD' },
    ]) {
      await post({ ...payload('INVALID'), ...invalid }).expect(400);
    }
    await post(
      payload('OUTSIDE', '00000000-0000-4000-8000-000000000001'),
    ).expect(403);
  });

  it('updates names and rejects nulls, duplicates and root mutations', async () => {
    await patch(emptyId, { name: 'Renamed test', code: 'test_new' }).expect(
      200,
    );
    expect(
      (await db.getRepository(Organization).findOneByOrFail({ id: emptyId }))
        .code,
    ).toBe('TEST_NEW');
    await patch(emptyId, { name: null }).expect(400);
    await patch(emptyId, { isActive: false }).expect(400);
    await patch(emptyId, { code: 'id' }).expect(409);
    await patch(root.id, { parentId: emptyId }).expect(400);
    await patch(root.id, { code: 'NEW_ROOT' }).expect(400);
    await status(root.id, false).expect(400);
  });

  it('rejects self/descendant parents; allows moving an unused leaf', async () => {
    const child = await post(payload('CHILD', emptyId)).expect(201);
    await patch(emptyId, { parentId: emptyId }).expect(400);
    await patch(emptyId, { parentId: child.body.data.id }).expect(400);
    await patch(emptyId, { parentId: branch.id }).expect(409);
    await status(emptyId, false).expect(409);
    await patch(child.body.data.id, { parentId: branch.id }).expect(200);
  });

  it('deactivates an unused leaf, removes it from business lists and allows reactivation', async () => {
    await status(emptyId, false).expect(200);
    const active = await list('/organizations').expect(200);
    expect(active.body.data.some((o: Organization) => o.id === emptyId)).toBe(
      false,
    );
    const all = await list('/organizations/management').expect(200);
    expect(
      all.body.data.find((o: Organization) => o.id === emptyId).isActive,
    ).toBe(false);
    await post(payload('INACTIVE_CHILD', emptyId)).expect(403);
    await status(emptyId, true).expect(200);
  });

  it('blocks deactivation/reparenting of institutions with members', async () => {
    const memberOrg = await post(payload('MEMBERS')).expect(201);
    await db.getRepository(UserOrganizationMembership).save({
      userId: admin.id,
      organizationId: memberOrg.body.data.id,
      role: Role.ORG_ADMIN,
    });
    await status(memberOrg.body.data.id, false).expect(409);
    await patch(memberOrg.body.data.id, { parentId: branch.id }).expect(409);
    const token = app.get(JwtService).sign({
      sub: admin.id,
      username: admin.username,
      role: Role.HQ_ADMIN,
      preAuth: false,
      activeOrgId: memberOrg.body.data.id,
    });
    await list('/organizations/management', token).expect(403);
  });

  it('validates policy values and thresholds; allows unused calendar changes', async () => {
    await policy(emptyId, {
      timezone: 'Asia/Bangkok',
      businessDayCutoff: '03:00',
      longStayDays: 10,
    }).expect(200);
    await policy(emptyId, { utilizationWarningPercent: 95 }).expect(400);
    await policy(emptyId, { longStayDays: null }).expect(400);
    await policy(emptyId, { timezone: '' }).expect(400);
    await policy(emptyId, { snapshotEnabled: null }).expect(400);
    await policy(emptyId, { lockTimeoutHours: 0 }).expect(400);
    await policy(emptyId, {
      utilizationWarningPercent: 70,
      utilizationCriticalPercent: 85,
    }).expect(200);
  });

  it('protects operational organizations from currency, hierarchy, calendar and status changes', async () => {
    await db
      .getRepository(Yard)
      .save({ organizationId: emptyId, code: 'TEST_YARD', name: 'Test yard' });
    await patch(emptyId, { defaultCurrency: 'MYR' }).expect(409);
    await patch(emptyId, { parentId: branch.id }).expect(409);
    await policy(emptyId, { timezone: 'UTC' }).expect(409);
    await status(emptyId, false).expect(409);
    await patch(emptyId, { name: 'Operational renamed' }).expect(200);
    await policy(emptyId, { longStayDays: 11 }).expect(200);
  });

  it('protects historical snapshots even if no current business records remain', async () => {
    const historical = await post(payload('HISTORY')).expect(201);
    const id = historical.body.data.id;
    await db.query(
      `INSERT INTO daily_snapshot_runs
      (organization_id, business_date, timezone, business_day_cutoff, window_start, window_end, policy, status)
      VALUES ($1, '2026-01-01', 'Asia/Jakarta', '02:00:00', '2025-12-31T19:00:00Z', '2026-01-01T19:00:00Z', '{}', 'COMPLETED')`,
      [id],
    );
    await policy(id, { timezone: 'UTC' }).expect(409);
    await policy(id, { businessDayCutoff: '03:00' }).expect(409);
    await policy(id, { businessDayCutoff: '02:00', longStayDays: 12 }).expect(
      200,
    );
    await patch(id, { parentId: branch.id }).expect(409);
    await patch(id, { defaultCurrency: 'MYR' }).expect(409);
    await status(id, false).expect(409);
  });

  it('onboards an organization through user login, yard/zone/slot and partner setup with sibling isolation', async () => {
    const org = (await post(payload('ONBOARD')).expect(201)).body.data;
    await request(app.getHttpServer())
      .post('/users')
      .auth(hqToken, { type: 'bearer' })
      .send({
        username: 'onboard_admin',
        password,
        displayName: 'New organization admin',
        role: Role.ORG_ADMIN,
        organizationId: org.id,
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'onboard_admin', password })
      .expect(201);
    expect(login.body.data.activeOrgId).toBe(org.id);
    const token = login.body.data.accessToken;
    expect(
      (await list('/organizations', token).expect(200)).body.data.map(
        (o: Organization) => o.id,
      ),
    ).toEqual([org.id]);
    const create = (path: string, body: object, auth = token) =>
      request(app.getHttpServer())
        .post(path)
        .auth(auth, { type: 'bearer' })
        .send(body);
    const yard = (
      await create('/yards', {
        organizationId: org.id,
        code: 'ONBOARD_YARD',
        name: 'Test yard',
      }).expect(201)
    ).body.data;
    const zone = (
      await create(`/yards/${yard.id}/zones`, {
        code: 'A1',
        name: 'Test zone',
        lineCount: 2,
        rowCount: 3,
      }).expect(201)
    ).body.data;
    await create(
      `/yards/${yard.id}/zones/${zone.id}/generate-slots`,
      {},
    ).expect(201);
    const slots = await list(`/yards/${yard.id}/slots`, token).expect(200);
    expect(slots.body.data).toHaveLength(6);
    const customer = (
      await create('/customers', {
        organizationId: org.id,
        name: 'Test customer',
      }).expect(201)
    ).body.data;
    const carrier = (
      await create('/carriers', {
        organizationId: org.id,
        name: 'Test carrier',
        type: 'EXTERNAL',
      }).expect(201)
    ).body.data;
    for (const [path, id] of [
      ['yards', yard.id],
      ['customers', customer.id],
      ['carriers', carrier.id],
    ]) {
      expect(
        (await list(`/${path}`, token).expect(200)).body.data.some(
          (row: { id: string }) => row.id === id,
        ),
      ).toBe(true);
      expect(
        (await list(`/${path}`, hqToken).expect(200)).body.data.some(
          (row: { id: string }) => row.id === id,
        ),
      ).toBe(true);
      expect(
        (await list(`/${path}`, orgToken).expect(200)).body.data.some(
          (row: { id: string }) => row.id === id,
        ),
      ).toBe(false);
    }
    // Scoped yard lookup deliberately hides out-of-scope IDs as not found.
    await list(`/yards/${yard.id}/slots`, orgToken).expect(404);
    await create('/yards', {
      organizationId: branch.id,
      code: 'ILLEGAL',
      name: 'No',
    }).expect(403);
    await create('/customers', {
      organizationId: branch.id,
      name: 'No',
    }).expect(403);
    await create('/carriers', {
      organizationId: branch.id,
      name: 'No',
      type: 'EXTERNAL',
    }).expect(403);
    await status(org.id, false).expect(409);
  });

  it('rolls back organization creation if saving the policy fails', async () => {
    await db.query(`CREATE FUNCTION reject_test_policy() RETURNS trigger AS $$
      BEGIN IF EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND code='ROLLBACK') THEN
      RAISE EXCEPTION 'test policy failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_test_policy BEFORE INSERT ON organization_operating_policies FOR EACH ROW EXECUTE FUNCTION reject_test_policy();`);
    try {
      await post(payload('ROLLBACK')).expect(500);
      expect(
        await db.getRepository(Organization).countBy({ code: 'ROLLBACK' }),
      ).toBe(0);
    } finally {
      await db.query(
        'DROP TRIGGER reject_test_policy ON organization_operating_policies; DROP FUNCTION reject_test_policy();',
      );
    }
  });
});
