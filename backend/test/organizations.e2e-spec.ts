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
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { Permission } from '../src/common/enums/permission.enum';
import { defaultRolePermissions } from '../src/common/rbac/permission-catalog';
import { AccessRole } from '../src/modules/users/entities/access-role.entity';
import { TransportModule } from '../src/modules/transport/transport.module';
import { Customer } from '../src/modules/customers/entities/customer.entity';

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

  let fixtureSequence = 0;
  const fixtureRole = (
    organizationId: string,
    type: Role,
    permissions = defaultRolePermissions(type),
  ) =>
    db.getRepository(AccessRole).save({
      organizationId,
      type,
      name: 'Fixture role ' + ++fixtureSequence,
      permissions,
      isActive: true,
    });
  const apiRole = async (
    organizationId: string,
    type: Role,
    permissions: string[],
    name = 'API role ' + ++fixtureSequence,
  ) =>
    (
      await request(app.getHttpServer())
        .post('/roles')
        .auth(hqToken, { type: 'bearer' })
        .send({ organizationId, type, name, permissions })
        .expect(201)
    ).body.data as AccessRole;

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
        TransportModule,
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
      app.get(JwtAuthGuard),
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
      await db.getRepository(UserOrganizationMembership).save({
        userId: user.id,
        organizationId: org.id,
        role,
        accessRoles: [await fixtureRole(org.id, role)],
      });
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
    await post(payload('INACTIVE_CHILD', emptyId)).expect(400);
    await status(emptyId, true).expect(200);
  });

  it('blocks deactivation/reparenting of institutions with members', async () => {
    const memberOrg = await post(payload('MEMBERS')).expect(201);
    await db.getRepository(UserOrganizationMembership).save({
      userId: admin.id,
      organizationId: memberOrg.body.data.id,
      role: Role.ORG_ADMIN,
      accessRoles: [await fixtureRole(memberOrg.body.data.id, Role.ORG_ADMIN)],
    });
    await status(memberOrg.body.data.id, false).expect(409);
    await patch(memberOrg.body.data.id, { parentId: branch.id }).expect(409);
    const token = new JwtService({ secret: process.env.JWT_SECRET }).sign({
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
        roleIds: [
          (
            await apiRole(
              org.id,
              Role.ORG_ADMIN,
              defaultRolePermissions(Role.ORG_ADMIN),
            )
          ).id,
        ],
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

  it('keeps HQ business read-only while allowing organization governance', async () => {
    await list('/customers').expect(200);
    await list('/yards').expect(200);
    for (const [path, body] of [
      ['/yards', { organizationId: branch.id, code: 'HQ_WRITE', name: 'No' }],
      ['/customers', { organizationId: branch.id, name: 'No' }],
      [
        '/carriers',
        { organizationId: branch.id, name: 'No', type: 'EXTERNAL' },
      ],
    ] as const)
      await request(app.getHttpServer())
        .post(path)
        .auth(hqToken, { type: 'bearer' })
        .send(body)
        .expect(403);
    await list('/organizations/management').expect(200);
  });

  it('isolates feature grants per membership and revokes existing tokens immediately', async () => {
    const second = (await post(payload('PERMISSIONS_B')).expect(201)).body.data;
    const roleA = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:customers',
      'menu:dashboard',
    ]);
    const roleB = await apiRole(second.id, Role.ORG_ADMIN, [
      'menu:carriers',
      'menu:dashboard',
    ]);
    const created = await request(app.getHttpServer())
      .post('/users')
      .auth(hqToken, { type: 'bearer' })
      .send({
        username: 'permission_user',
        password,
        displayName: 'Scoped user',
        role: Role.ORG_ADMIN,
        organizationId: branch.id,
        roleIds: [roleA.id],
      })
      .expect(201);
    const userId = created.body.data.id;
    const firstMembership = created.body.data.memberships[0];
    await request(app.getHttpServer())
      .post(`/users/${userId}/memberships`)
      .auth(hqToken, { type: 'bearer' })
      .send({
        organizationId: second.id,
        role: Role.ORG_ADMIN,
        roleIds: [roleB.id],
      })
      .expect(201);
    const pre = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'permission_user', password })
        .expect(201)
    ).body.data;
    expect(pre.permissions).toEqual([]);
    expect(pre.navigation).toEqual([]);
    await list('/customers', pre.accessToken).expect(401);
    const select = async (id: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/select-org')
          .auth(pre.accessToken, { type: 'bearer' })
          .send({ organizationId: id })
          .expect(201)
      ).body.data;
    const a = await select(branch.id);
    const switchTo = async (token: string, organizationId: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/switch-org')
          .auth(token, { type: 'bearer' })
          .send({ organizationId })
          .expect(201)
      ).body.data;
    const b = await switchTo(a.accessToken, second.id);
    expect(b.activeOrgId).toBe(second.id);
    expect(b.permissions).toContain('menu:carriers');
    expect(b.permissions).not.toContain('menu:customers');
    const back = await switchTo(b.accessToken, branch.id);
    expect(back.permissions).toContain('menu:customers');
    expect(back.permissions).not.toContain('menu:carriers');
    await request(app.getHttpServer())
      .post('/auth/switch-org')
      .auth(b.accessToken, { type: 'bearer' })
      .send({ organizationId: root.id })
      .expect(403);
    await list('/customers', a.accessToken).expect(200);
    await list('/carriers', a.accessToken).expect(403);
    await list('/customers', b.accessToken).expect(403);
    await list('/carriers', b.accessToken).expect(200);
    expect(
      (await list('/organizations', a.accessToken)).body.data.map(
        (o: Organization) => o.id,
      ),
    ).toEqual([branch.id]);
    const forgedRole = new JwtService({ secret: process.env.JWT_SECRET }).sign({
      sub: userId,
      activeOrgId: branch.id,
      role: Role.HQ_ADMIN,
      preAuth: false,
    });
    await list('/organizations/management', forgedRole).expect(403);
    const update = (roleIds: string[], isActive = true) =>
      request(app.getHttpServer())
        .patch(`/users/${userId}/memberships/${firstMembership.id}`)
        .auth(hqToken, { type: 'bearer' })
        .send({ role: Role.ORG_ADMIN, roleIds, isActive });
    await update([]).expect(200);
    await list('/customers', a.accessToken).expect(403);
    await update([], false).expect(200);
    await list('/organizations', a.accessToken).expect(403);
    await list('/auth/me', a.accessToken).expect(403);
    await request(app.getHttpServer())
      .post('/auth/switch-org')
      .auth(b.accessToken, { type: 'bearer' })
      .send({ organizationId: branch.id })
      .expect(403);
    const meB = (await list('/auth/me', b.accessToken).expect(200)).body.data;
    expect(
      meB.memberships.map((m: { organizationId: string }) => m.organizationId),
    ).toEqual([second.id]);
    const relogin = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'permission_user', password })
        .expect(201)
    ).body.data;
    expect(relogin.mode).toBe('SINGLE_ORG');
    expect(relogin.activeOrgId).toBe(second.id);
    expect(relogin.permissions).not.toContain('menu:customers');
    await list('/carriers', b.accessToken).expect(200);
    await request(app.getHttpServer())
      .patch(`/users/${userId}/deactivate`)
      .auth(orgToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${userId}/deactivate`)
      .auth(hqToken, { type: 'bearer' })
      .expect(200);
    await list('/carriers', b.accessToken).expect(401);
  });

  it('rejects cross-organization yard binding and permission escalation', async () => {
    const outside = await db
      .getRepository(Yard)
      .findOne({ where: { code: 'ONBOARD_YARD' } });
    await request(app.getHttpServer())
      .post('/users')
      .auth(orgToken, { type: 'bearer' })
      .send({
        username: 'bad_yard_binding',
        password,
        displayName: 'No',
        role: Role.YARD_STAFF,
        organizationId: branch.id,
        scopeYardId: outside!.id,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/roles')
      .auth(orgToken, { type: 'bearer' })
      .send({
        organizationId: branch.id,
        type: Role.ORG_ADMIN,
        name: 'Illegal HQ',
        permissions: ['menu:setup-organizations', Permission.ORG_CRUD],
      })
      .expect(400);
    const orgUser = await db
      .getRepository(User)
      .findOneByOrFail({ username: 'org_test' });
    const membership = await db
      .getRepository(UserOrganizationMembership)
      .findOneOrFail({
        where: { userId: orgUser.id, organizationId: branch.id },
        relations: { accessRoles: true },
      });
    const original = membership.accessRoles;
    const delegatedRole = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:outbound-plan',
      Permission.OUTBOUND_PLAN,
    ]);
    membership.accessRoles = [
      await fixtureRole(branch.id, Role.ORG_ADMIN, [
        'menu:users',
        Permission.SETUP_USER_CRUD,
        Permission.SETUP_USER_MEMBERSHIP,
      ]),
    ];
    await db.getRepository(UserOrganizationMembership).save(membership);
    try {
      await request(app.getHttpServer())
        .post('/users')
        .auth(orgToken, { type: 'bearer' })
        .send({
          username: 'bad_delegation',
          password,
          displayName: 'No',
          role: Role.ORG_ADMIN,
          organizationId: branch.id,
          roleIds: [delegatedRole.id],
        })
        .expect(403);
    } finally {
      membership.accessRoles = original;
      await db.getRepository(UserOrganizationMembership).save(membership);
    }
  });

  it('uses the selected membership role and yard, never the account-level role or another organization yard', async () => {
    const second = (await post(payload('YARD_SCOPE_B')).expect(201)).body.data;
    const yardA = await db
      .getRepository(Yard)
      .save({ organizationId: branch.id, code: 'BOUND_A', name: 'Bound A' });
    const yardB = await db
      .getRepository(Yard)
      .save({ organizationId: second.id, code: 'BOUND_B', name: 'Bound B' });
    const hidden = await db
      .getRepository(Yard)
      .save({ organizationId: second.id, code: 'OTHER_B', name: 'Other B' });
    const roleA = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:yard-board',
      'menu:customers',
    ]);
    const roleB = await apiRole(second.id, Role.YARD_STAFF, [
      'menu:yard-board',
      'menu:inbound-scan',
      Permission.INBOUND_SCAN,
    ]);
    const created = (
      await request(app.getHttpServer())
        .post('/users')
        .auth(hqToken, { type: 'bearer' })
        .send({
          username: 'multi_yard_user',
          password,
          displayName: 'Different roles',
          role: Role.ORG_ADMIN,
          organizationId: branch.id,
          roleIds: [roleA.id],
        })
        .expect(201)
    ).body.data;
    const member = (
      await request(app.getHttpServer())
        .post(`/users/${created.id}/memberships`)
        .auth(hqToken, { type: 'bearer' })
        .send({
          organizationId: second.id,
          role: Role.YARD_STAFF,
          scopeYardId: yardB.id,
          roleIds: [roleB.id],
        })
        .expect(201)
    ).body.data;
    const pre = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'multi_yard_user', password })
        .expect(201)
    ).body.data.accessToken;
    const select = async (organizationId: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/select-org')
          .auth(pre, { type: 'bearer' })
          .send({ organizationId })
          .expect(201)
      ).body.data;
    const a = await select(branch.id);
    const b = await select(second.id);
    expect(a.user.role).toBe(Role.ORG_ADMIN);
    expect(b.user.role).toBe(Role.YARD_STAFF);
    const localCustomer = await db
      .getRepository(Customer)
      .save({ name: 'Local customer', organizationId: second.id });
    const options = (
      await list('/customers/options', b.accessToken).expect(200)
    ).body.data;
    expect(options.map((c: { id: string }) => c.id)).toEqual([
      localCustomer.id,
    ]);
    expect(Object.keys(options[0]).sort()).toEqual(['id', 'name']);
    expect(
      (await list('/yards', b.accessToken).expect(200)).body.data.map(
        (y: Yard) => y.id,
      ),
    ).toEqual([yardB.id]);
    await list(`/yards/${yardA.id}/slots`, b.accessToken).expect(404);
    await list(`/yards/${hidden.id}/slots`, b.accessToken).expect(404);
    await list('/customers', a.accessToken).expect(200);
    await list('/customers', b.accessToken).expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${created.id}/memberships/${member.id}`)
      .auth(hqToken, { type: 'bearer' })
      .send({
        role: Role.YARD_STAFF,
        isActive: true,
        scopeYardId: hidden.id,
        roleIds: [roleB.id],
      })
      .expect(200);
    expect(
      (await list('/yards', b.accessToken).expect(200)).body.data.map(
        (y: Yard) => y.id,
      ),
    ).toEqual([hidden.id]);
    await list(`/yards/${yardB.id}/slots`, b.accessToken).expect(404);
  });

  it('validates role menus, scope ceilings and unique names without accepting legacy grants', async () => {
    await apiRole(
      branch.id,
      Role.ORG_ADMIN,
      ['menu:customers'],
      'Unique custom role',
    );
    const createRole = (body: object) =>
      request(app.getHttpServer())
        .post('/roles')
        .auth(hqToken, { type: 'bearer' })
        .send({
          organizationId: branch.id,
          type: Role.ORG_ADMIN,
          name: 'Invalid role',
          permissions: [],
          ...body,
        });
    await createRole({ name: ' unique CUSTOM role ' }).expect(409);
    await createRole({ name: '   ' }).expect(400);
    await createRole({ type: undefined }).expect(400);
    await createRole({ permissions: ['unknown:permission'] }).expect(400);
    await createRole({ permissions: [Permission.OUTBOUND_PLAN] }).expect(400);
    await createRole({ type: Role.HQ_ADMIN }).expect(400);
    await createRole({
      organizationId: root.id,
      type: Role.HQ_ADMIN,
      permissions: ['menu:outbound-plan', Permission.OUTBOUND_PLAN],
    }).expect(400);
    await request(app.getHttpServer())
      .post('/users')
      .auth(hqToken, { type: 'bearer' })
      .send({
        username: 'legacy_grant',
        displayName: 'No',
        password,
        role: Role.ORG_ADMIN,
        organizationId: branch.id,
        permissions: [Permission.SETUP_USER_CRUD],
      })
      .expect(400);
    const catalog = (
      await list(
        `/roles/catalog?organizationId=${branch.id}&type=ORG_ADMIN`,
      ).expect(200)
    ).body.data;
    expect(
      catalog
        .find((m: { key: string }) => m.key === 'users')
        .actions.map((a: { code: string }) => a.code),
    ).toEqual(
      expect.arrayContaining([
        Permission.SETUP_USER_CRUD,
        Permission.SETUP_USER_MEMBERSHIP,
      ]),
    );
    await list(`/roles?organizationId=${root.id}`, orgToken).expect(403);
  });

  it('unions multiple custom roles and reflects role edits/removal on an existing token', async () => {
    const customer = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:customers',
    ]);
    const carrier = await apiRole(branch.id, Role.ORG_ADMIN, ['menu:carriers']);
    const created = (
      await request(app.getHttpServer())
        .post('/users')
        .auth(hqToken, { type: 'bearer' })
        .send({
          username: 'union_user',
          displayName: 'Union',
          password,
          role: Role.ORG_ADMIN,
          organizationId: branch.id,
          roleIds: [customer.id, carrier.id],
        })
        .expect(201)
    ).body.data;
    const token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'union_user', password })
        .expect(201)
    ).body.data.accessToken;
    await list('/customers', token).expect(200);
    await list('/carriers', token).expect(200);
    const changeRole = (permissions: string[], isActive = true) =>
      request(app.getHttpServer())
        .patch(`/roles/${customer.id}`)
        .auth(hqToken, { type: 'bearer' })
        .send({ name: customer.name, permissions, isActive });
    await changeRole(['menu:customers'], false).expect(409);
    await changeRole([
      'menu:customers',
      Permission.PARTNER_CUSTOMER_CRUD,
    ]).expect(200);
    expect(
      (await list('/auth/me', token).expect(200)).body.data.permissions,
    ).toContain(Permission.PARTNER_CUSTOMER_CRUD);
    await changeRole(['menu:customers']).expect(200);
    await request(app.getHttpServer())
      .post('/customers')
      .auth(token, { type: 'bearer' })
      .send({ organizationId: branch.id, name: 'Forbidden' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${created.id}/memberships/${created.memberships[0].id}`)
      .auth(hqToken, { type: 'bearer' })
      .send({ role: Role.ORG_ADMIN, roleIds: [customer.id], isActive: true })
      .expect(200);
    await list('/carriers', token).expect(403);
    await list('/customers', token).expect(200);
  });

  it('separates menu reading from role/user administration and supports limited directory lookup', async () => {
    const readonly = await apiRole(root.id, Role.HQ_ADMIN, [
      'menu:users',
      'menu:roles',
      'menu:setup-organizations',
    ]);
    const createUser = async (
      username: string,
      organizationId: string,
      type: Role,
      roleIds: string[],
    ) =>
      (
        await request(app.getHttpServer())
          .post('/users')
          .auth(hqToken, { type: 'bearer' })
          .send({
            username,
            password,
            displayName: username,
            organizationId,
            role: type,
            roleIds,
          })
          .expect(201)
      ).body.data;
    const reader = await createUser('read_admin', root.id, Role.HQ_ADMIN, [
      readonly.id,
    ]);
    const token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'read_admin', password })
        .expect(201)
    ).body.data.accessToken;
    await list('/users', token).expect(200);
    await list(`/roles?organizationId=${branch.id}`, token).expect(200);
    await list('/organizations/management', token).expect(200);
    await request(app.getHttpServer())
      .post('/roles')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${reader.id}/memberships/${reader.memberships[0].id}`)
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(403);
    const clerkRole = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:users',
      Permission.SETUP_USER_CRUD,
    ]);
    await createUser('account_clerk', branch.id, Role.ORG_ADMIN, [
      clerkRole.id,
    ]);
    const clerk = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'account_clerk', password })
        .expect(201)
    ).body.data.accessToken;
    await list('/yards', clerk).expect(403);
    const yards = (
      await list(
        `/users/assignment-yards?organizationId=${branch.id}`,
        clerk,
      ).expect(200)
    ).body.data;
    expect(yards.length).toBeGreaterThan(0);
    expect(Object.keys(yards[0]).sort()).toEqual(['code', 'id', 'name']);
    await list(
      `/users/assignment-yards?organizationId=${root.id}`,
      clerk,
    ).expect(403);
    await list(
      `/roles/assignable?organizationId=${branch.id}&type=ORG_ADMIN`,
      clerk,
    ).expect(403);
  });

  it('does not expose finance APIs to transport-only readers', async () => {
    const role = await apiRole(branch.id, Role.ORG_ADMIN, ['menu:transport']);
    await request(app.getHttpServer())
      .post('/users')
      .auth(hqToken, { type: 'bearer' })
      .send({
        username: 'dispatch_reader',
        password,
        displayName: 'Reader',
        organizationId: branch.id,
        role: Role.ORG_ADMIN,
        roleIds: [role.id],
      })
      .expect(201);
    const token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'dispatch_reader', password })
        .expect(201)
    ).body.data.accessToken;
    await list('/transport/orders', token).expect(200);
    await list('/transport/charges', token).expect(403);
    await list('/transport/tariffs', token).expect(403);
    await list('/transport/charges', hqToken).expect(200);
    await request(app.getHttpServer())
      .post('/transport/orders')
      .auth(hqToken, { type: 'bearer' })
      .send({})
      .expect(403);
  });

  it('rejects cross-org/type and disabled role assignment, self editing and higher-privilege revocation', async () => {
    const other = await apiRole(emptyId, Role.ORG_ADMIN, ['menu:customers']);
    const yard = await apiRole(branch.id, Role.YARD_STAFF, ['menu:yard-board']);
    const disabled = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:customers',
    ]);
    await request(app.getHttpServer())
      .patch(`/roles/${disabled.id}`)
      .auth(hqToken, { type: 'bearer' })
      .send({
        name: disabled.name,
        permissions: disabled.permissions,
        isActive: false,
      })
      .expect(200);
    for (const role of [other, yard, disabled])
      await request(app.getHttpServer())
        .post('/users')
        .auth(hqToken, { type: 'bearer' })
        .send({
          username: 'bad_role_assignment',
          password,
          displayName: 'No',
          organizationId: branch.id,
          role: Role.ORG_ADMIN,
          roleIds: [role.id],
        })
        .expect(400);
    const own = await db
      .getRepository(UserOrganizationMembership)
      .findOneOrFail({
        where: { userId: admin.id, organizationId: root.id },
        relations: { accessRoles: true },
      });
    const ownRole = own.accessRoles[0];
    const ownListed = (
      await list(`/roles?organizationId=${root.id}`).expect(200)
    ).body.data.find((r: { id: string }) => r.id === ownRole.id);
    expect(ownListed.isAssignedToSelf).toBe(true);
    expect(ownListed.canManage).toBe(true);
    await request(app.getHttpServer())
      .patch(`/roles/${ownRole.id}`)
      .auth(hqToken, { type: 'bearer' })
      .send({ name: ownRole.name, permissions: [], isActive: true })
      .expect(403);
    const limited = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:users',
      Permission.SETUP_USER_MEMBERSHIP,
      'menu:roles',
      Permission.SETUP_ROLE_MANAGE,
    ]);
    const actor = (
      await request(app.getHttpServer())
        .post('/users')
        .auth(hqToken, { type: 'bearer' })
        .send({
          username: 'limited_role_admin',
          password,
          displayName: 'Limited',
          organizationId: branch.id,
          role: Role.ORG_ADMIN,
          roleIds: [limited.id],
        })
        .expect(201)
    ).body.data;
    const token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'limited_role_admin', password })
        .expect(201)
    ).body.data.accessToken;
    const orgUser = await db
      .getRepository(User)
      .findOneByOrFail({ username: 'org_test' });
    const orgMember = await db
      .getRepository(UserOrganizationMembership)
      .findOneOrFail({
        where: { userId: orgUser.id, organizationId: branch.id },
        relations: { accessRoles: true },
      });
    const listed = (
      await list(`/roles?organizationId=${branch.id}`, token).expect(200)
    ).body.data;
    expect(
      listed.find((r: { id: string }) => r.id === limited.id).isAssignedToSelf,
    ).toBe(true);
    expect(
      listed.find((r: { id: string }) => r.id === orgMember.accessRoles[0].id)
        .canManage,
    ).toBe(false);
    await request(app.getHttpServer())
      .patch(`/users/${orgUser.id}/memberships/${orgMember.id}`)
      .auth(token, { type: 'bearer' })
      .send({ role: Role.ORG_ADMIN, roleIds: [], isActive: true })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/users/${orgUser.id}/memberships/${orgMember.id}`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/roles/${orgMember.accessRoles[0].id}`)
      .auth(token, { type: 'bearer' })
      .send({ name: 'No', permissions: [], isActive: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${actor.id}/memberships/${actor.memberships[0].id}`)
      .auth(token, { type: 'bearer' })
      .send({ role: Role.ORG_ADMIN, roleIds: [], isActive: true })
      .expect(403);
  });

  it('switches the same account between HQ read-only and branch business grants without carrying privileges', async () => {
    const hqRole = await apiRole(root.id, Role.HQ_ADMIN, ['menu:customers']);
    const branchRole = await apiRole(branch.id, Role.ORG_ADMIN, [
      'menu:customers',
      Permission.PARTNER_CUSTOMER_CRUD,
    ]);
    const created = (
      await request(app.getHttpServer())
        .post('/users')
        .auth(hqToken, { type: 'bearer' })
        .send({
          username: 'hq_branch_switch',
          password,
          displayName: 'HQ and branch',
          role: Role.HQ_ADMIN,
          organizationId: root.id,
          roleIds: [hqRole.id],
        })
        .expect(201)
    ).body.data;
    await request(app.getHttpServer())
      .post(`/users/${created.id}/memberships`)
      .auth(hqToken, { type: 'bearer' })
      .send({
        organizationId: branch.id,
        role: Role.ORG_ADMIN,
        roleIds: [branchRole.id],
      })
      .expect(201);
    const pre = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'hq_branch_switch', password })
        .expect(201)
    ).body.data;
    expect(pre.mode).toBe('NEEDS_SELECTION');
    const hq = (
      await request(app.getHttpServer())
        .post('/auth/select-org')
        .auth(pre.accessToken, { type: 'bearer' })
        .send({ organizationId: root.id })
        .expect(201)
    ).body.data;
    expect(hq.user.role).toBe(Role.HQ_ADMIN);
    expect(hq.permissions).not.toContain(Permission.PARTNER_CUSTOMER_CRUD);
    await list('/customers', hq.accessToken).expect(200);
    await request(app.getHttpServer())
      .post('/customers')
      .auth(hq.accessToken, { type: 'bearer' })
      .send({ name: 'HQ denied', organizationId: branch.id })
      .expect(403);
    const local = (
      await request(app.getHttpServer())
        .post('/auth/switch-org')
        .auth(hq.accessToken, { type: 'bearer' })
        .send({ organizationId: branch.id })
        .expect(201)
    ).body.data;
    expect(local.user.role).toBe(Role.ORG_ADMIN);
    expect(local.permissions).toContain(Permission.PARTNER_CUSTOMER_CRUD);
    await request(app.getHttpServer())
      .post('/customers')
      .auth(local.accessToken, { type: 'bearer' })
      .send({ name: 'Branch allowed', organizationId: branch.id })
      .expect(201);
    await request(app.getHttpServer())
      .post('/customers')
      .auth(local.accessToken, { type: 'bearer' })
      .send({ name: 'Cross branch denied', organizationId: emptyId })
      .expect(403);
    const localRows = (await list('/customers', local.accessToken).expect(200))
      .body.data;
    expect(
      localRows.every((c: Customer) => c.organizationId === branch.id),
    ).toBe(true);
    const back = (
      await request(app.getHttpServer())
        .post('/auth/switch-org')
        .auth(local.accessToken, { type: 'bearer' })
        .send({ organizationId: root.id })
        .expect(201)
    ).body.data;
    expect(back.user.role).toBe(Role.HQ_ADMIN);
    expect(back.permissions).not.toContain(Permission.PARTNER_CUSTOMER_CRUD);
    await request(app.getHttpServer())
      .post('/customers')
      .auth(back.accessToken, { type: 'bearer' })
      .send({ name: 'Still denied', organizationId: branch.id })
      .expect(403);
  });

  it('ignores inactive and wrong-organization roles at runtime, and rejects a disabled organization on existing sessions', async () => {
    const org = (await post(payload('RUNTIME_SCOPE')).expect(201)).body.data;
    const local = await fixtureRole(org.id, Role.ORG_ADMIN, ['menu:customers']);
    const foreign = await fixtureRole(branch.id, Role.ORG_ADMIN, [
      'menu:carriers',
    ]);
    const wrongType = await fixtureRole(org.id, Role.YARD_STAFF, [
      'menu:waybills',
    ]);
    const user = await db
      .getRepository(User)
      .save({
        username: 'runtime_scope',
        displayName: 'Runtime',
        role: Role.ORG_ADMIN,
        passwordHash: await bcrypt.hash(password, 4),
      });
    await db
      .getRepository(UserOrganizationMembership)
      .save({
        userId: user.id,
        organizationId: org.id,
        role: Role.ORG_ADMIN,
        accessRoles: [local, foreign, wrongType],
      });
    const login = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'runtime_scope', password })
        .expect(201)
    ).body.data;
    expect(login.permissions).toContain('menu:customers');
    expect(login.permissions).not.toContain('menu:carriers');
    expect(login.permissions).not.toContain('menu:waybills');
    await list('/carriers', login.accessToken).expect(403);
    await db.getRepository(AccessRole).update(local.id, { isActive: false });
    expect(
      (await list('/auth/me', login.accessToken).expect(200)).body.data
        .permissions,
    ).toEqual([]);
    await list('/customers', login.accessToken).expect(403);
    await db.getRepository(Organization).update(org.id, { isActive: false });
    await list('/auth/me', login.accessToken).expect(403);
    await request(app.getHttpServer())
      .post('/auth/switch-org')
      .auth(login.accessToken, { type: 'bearer' })
      .send({ organizationId: org.id })
      .expect(403);
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
