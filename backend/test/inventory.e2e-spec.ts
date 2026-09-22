import { OutboundService } from '../src/modules/outbound/outbound.service';
import { CustomerAddress } from '../src/modules/customers/entities/customer-address.entity';
import { OperationType } from '../src/common/enums/operation-type.enum';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { YardsController } from '../src/modules/yards/yards.controller';
import { WaybillsController } from '../src/modules/waybills/waybills.controller';
import { ZonesService } from '../src/modules/yards/zones.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { Permission } from '../src/common/enums/permission.enum';
import { DataSource, IsNull } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../src/database/data-source';
import { YardInventory } from '../src/modules/inventory/entities/yard-inventory.entity';
import { InventoryMovement } from '../src/modules/inventory/entities/inventory-movement.entity';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { InboundService } from '../src/modules/inbound/inbound.service';
import { YardsService } from '../src/modules/yards/yards.service';
import { WaybillsService } from '../src/modules/waybills/waybills.service';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { DailySnapshotService } from '../src/modules/dashboard/daily-snapshot.service';
import { AuditService } from '../src/modules/tracking/audit.service';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { ScopeService } from '../src/common/scope/scope.service';
import { Organization } from '../src/modules/organizations/entities/organization.entity';
import { OrganizationOperatingPolicy } from '../src/modules/organizations/entities/organization-operating-policy.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserOrganizationMembership } from '../src/modules/users/entities/user-organization-membership.entity';
import { Yard } from '../src/modules/yards/entities/yard.entity';
import { YardZone } from '../src/modules/yards/entities/yard-zone.entity';
import { YardSlot } from '../src/modules/yards/entities/yard-slot.entity';
import { Order } from '../src/modules/orders/entities/order.entity';
import { OrderVin } from '../src/modules/orders/entities/order-vin.entity';
import { Customer } from '../src/modules/customers/entities/customer.entity';
import { InboundBatch } from '../src/modules/inbound/entities/inbound-batch.entity';
import { Carrier } from '../src/modules/carriers/entities/carrier.entity';
import { Driver } from '../src/modules/carriers/entities/driver.entity';
import { Vehicle } from '../src/modules/carriers/entities/vehicle.entity';
import { Waybill } from '../src/modules/waybills/entities/waybill.entity';
import { WaybillVin } from '../src/modules/waybills/entities/waybill-vin.entity';
import { OperationLog } from '../src/modules/tracking/entities/operation-log.entity';
import { WaybillStatusLog } from '../src/modules/tracking/entities/waybill-status-log.entity';
import { DriverPosition } from '../src/modules/tracking/entities/driver-position.entity';
import { Currency } from '../src/common/enums/currency.enum';
import { Role } from '../src/common/enums/role.enum';
import {
  TransportType,
  VehicleTowType,
} from '../src/common/enums/order-type.enum';
import {
  ScanAction,
  WaybillStatus,
} from '../src/common/enums/waybill-status.enum';
import { OrgScope } from '../src/common/scope/scope.types';
import { AuthenticatedUser } from '../src/modules/auth/auth.types';

const database = process.env.INVENTORY_TEST_DB;
if (database && !/^alms_inventory_test_\d+$/.test(database))
  throw new Error(
    'Use an empty disposable alms_inventory_test_<timestamp> database',
  );
(database ? describe : describe.skip)(
  'inventory transactions (real PostgreSQL)',
  () => {
    let db: DataSource,
      outbound: OutboundService,
      inventory: InventoryService,
      inbound: InboundService,
      yards: YardsService,
      waybills: WaybillsService;
    let audit: AuditService,
      tracking: TrackingService,
      dashboard: DashboardService;
    let scope: OrgScope,
      user: AuthenticatedUser,
      yard: Yard,
      zone: YardZone,
      staging: YardZone,
      slots: YardSlot[],
      order: Order;
    let app: INestApplication;
    beforeAll(async () => {
      db = new DataSource({
        ...AppDataSource.options,
        database,
        logging: false,
        synchronize: false,
      });
      await db.initialize();
      const repo = <T extends object>(entity: new () => T) =>
        db.getRepository(entity);
      audit = new AuditService(repo(OperationLog));
      tracking = new TrackingService(
        repo(WaybillStatusLog),
        repo(OperationLog),
        repo(DriverPosition),
      );
      const access = new ScopeService(
        repo(UserOrganizationMembership),
        repo(Organization),
        repo(User),
        repo(Yard),
      );
      outbound = new OutboundService(
        repo(Order),
        repo(OrderVin),
        repo(Yard),
        repo(Carrier),
        repo(Driver),
        repo(Vehicle),
        repo(Customer),
        repo(CustomerAddress),
        db,
        access,
        audit,
      );
      inventory = new InventoryService(audit);
      inbound = new InboundService(
        inventory,
        repo(Order),
        repo(OrderVin),
        repo(InboundBatch),
        repo(Yard),
        repo(YardSlot),
        repo(Customer),
        repo(Carrier),
        db,
        access,
        audit,
      );
      yards = new YardsService(
        inventory,
        repo(Yard),
        repo(YardSlot),
        repo(YardZone),
        repo(OrderVin),
        repo(WaybillVin),
        repo(WaybillStatusLog),
        db,
        access,
      );
      waybills = new WaybillsService(
        inventory,
        repo(Waybill),
        repo(WaybillVin),
        repo(Carrier),
        db,
        tracking,
        { emitWaybillStatusChanged: jest.fn() } as never,
        { notifyWaybillStatusChanged: jest.fn() } as never,
        {} as never,
        access,
        audit,
      );
      dashboard = new DashboardService(db, access);
      const module = await Test.createTestingModule({
        controllers: [YardsController, WaybillsController],
        providers: [
          { provide: YardsService, useValue: yards },
          { provide: InboundService, useValue: inbound },
          { provide: WaybillsService, useValue: waybills },
          { provide: ScopeService, useValue: access },
          {
            provide: ZonesService,
            useValue: new ZonesService(
              repo(Yard),
              repo(YardZone),
              repo(YardSlot),
              db,
              access,
              audit,
            ),
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = module.createNestApplication();
      app.useLogger(false);
      app.use(
        (req: { user: AuthenticatedUser }, _res: unknown, next: () => void) => {
          req.user = user;
          next();
        },
      );
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      app.useGlobalGuards(new PermissionsGuard(new Reflector()));
      await app.listen(0, '127.0.0.1');
    });
    afterAll(async () => {
      if (app) await app.close();
      if (db?.isInitialized) await db.destroy();
    });
    beforeEach(async () => {
      jest.restoreAllMocks();
      const suffix = randomUUID();
      const org = await db.getRepository(Organization).save({
        code: suffix,
        name: 'Inventory test',
        defaultCurrency: Currency.IDR,
      });
      await db.getRepository(OrganizationOperatingPolicy).save({
        organizationId: org.id,
        snapshotEnabled: true,
        timezone: 'UTC',
        businessDayCutoff: '00:00',
        snapshotStartedAt: new Date(),
        longStayDays: 3,
        lockTimeoutHours: 24,
        utilizationWarningPercent: 80,
        utilizationCriticalPercent: 90,
        expectedArrivalWarningHours: 24,
      });
      const actor = await db.getRepository(User).save({
        username: suffix,
        passwordHash: 'test',
        displayName: 'Stock operator',
        role: Role.ORG_ADMIN,
      });
      yard = await db
        .getRepository(Yard)
        .save({ organizationId: org.id, code: suffix, name: 'Test yard' });
      zone = await db.getRepository(YardZone).save({
        yardId: yard.id,
        code: 'P',
        lineCount: 1,
        rowCount: 5,
        purpose: 'PARKING',
      });
      staging = await db.getRepository(YardZone).save({
        yardId: yard.id,
        code: 'S',
        lineCount: 1,
        rowCount: 1,
        purpose: 'STAGING',
      });
      slots = await db.getRepository(YardSlot).save(
        [1, 2, 3, 4, 5].map((row) => ({
          yardId: yard.id,
          zoneId: zone.id,
          line: 1,
          row,
        })),
      );
      slots.push(
        await db
          .getRepository(YardSlot)
          .save({ yardId: yard.id, zoneId: staging.id, line: 1, row: 1 }),
      );
      const customer = await db
        .getRepository(Customer)
        .save({ organizationId: org.id, name: 'Test customer' });
      order = await db.getRepository(Order).save({
        organizationId: org.id,
        orderCode: suffix,
        customerId: customer.id,
        destinationYardId: yard.id,
        transportType: TransportType.TRANSFER,
      });
      scope = {
        type: 'ORG',
        activeOrgId: org.id,
        orgIds: [org.id],
        role: Role.ORG_ADMIN,
        scopeYardId: null,
      };
      user = {
        permissions: Object.values(Permission),
        userId: actor.id,
        username: actor.username,
        role: Role.ORG_ADMIN,
        preAuth: false,
        activeOrgId: org.id,
        scopeYardId: null,
        carrierId: null,
        customerId: null,
        scope,
      };
    });
    const makeVin = async () =>
      db.getRepository(OrderVin).save({
        orderId: order.id,
        vin: 'T' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase(),
      });
    const receive = async (v: OrderVin, slot = slots[0]) =>
      inbound.inboundScan(
        { vin: v.vin, slotId: slot.id, photoUrls: ['test/arrival.jpg'] },
        user,
      );
    const active = async (v: OrderVin) =>
      db
        .getRepository(YardInventory)
        .findOneByOrFail({ vin: v.vin, closedAt: IsNull() });
    const makeWaybill = async (vins: OrderVin[]) => {
      const carrier = await db
        .getRepository(Carrier)
        .save({ organizationId: scope.activeOrgId, name: 'Test carrier' });
      const driver = await db
        .getRepository(Driver)
        .save({ carrierId: carrier.id, name: 'Driver' });
      const vehicle = await db
        .getRepository(Vehicle)
        .save({ carrierId: carrier.id, plateNumber: randomUUID() });
      const w = await db.getRepository(Waybill).save({
        organizationId: scope.activeOrgId,
        waybillCode: randomUUID(),
        orderId: order.id,
        originYardId: yard.id,
        transportType: TransportType.DELIVERY,
        carrierId: carrier.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
      });
      await db
        .getRepository(WaybillVin)
        .save(vins.map((v) => ({ waybillId: w.id, vin: v.vin })));
      for (const v of vins)
        await db.getRepository(OrderVin).update(v.id, { isAllocated: true });
      return w;
    };
    it('enforces the actual manual-receipt, correction and signing HTTP contracts', async () => {
      const v = await makeVin();
      await request(app.getHttpServer())
        .patch(`/yards/slots/${slots[0].id}/assign`)
        .send({ vin: v.vin })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/yards/slots/${slots[0].id}/assign`)
        .send({ vin: v.vin, photoUrls: ['arrival.jpg'] })
        .expect(200);
      expect((await active(v)).slotId).toBe(slots[0].id);
      await request(app.getHttpServer())
        .patch(`/yards/slots/${slots[0].id}/release`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/yards/inventory/${v.vin}/undo-inbound`)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post('/waybills/scan')
        .send({ vin: v.vin, action: 'DELIVERY_DEPARTURE' })
        .expect(400);
      user.permissions = user.permissions!.filter(
        (p) => p !== Permission.YARD_ADJUST_INVENTORY,
      );
      await request(app.getHttpServer())
        .post('/yards/inventory/adjustments')
        .send({
          yardId: yard.id,
          vin: v.vin,
          direction: 'OUT',
          reference: 'COUNT',
          reason: 'verified',
        })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/yards/inventory/${v.vin}/undo-inbound`)
        .send({ reason: 'wrong receipt' })
        .expect(201);
    });
    it('rolls back zone configuration and its audit together', async () => {
      const zones = app.get(ZonesService);
      jest
        .spyOn(audit, 'log')
        .mockRejectedValueOnce(new Error('zone audit unavailable'));
      await expect(
        zones.create(
          yard.id,
          { code: 'FAILED', lineCount: 1, rowCount: 1, purpose: 'STAGING' },
          scope,
          user.userId,
        ),
      ).rejects.toThrow('zone audit unavailable');
      expect(
        await db
          .getRepository(YardZone)
          .countBy({ yardId: yard.id, code: 'FAILED' }),
      ).toBe(0);
      await zones.create(
        yard.id,
        { code: 'VALID', lineCount: 1, rowCount: 1, purpose: 'STAGING' },
        scope,
        user.userId,
      );
      expect(
        await db
          .getRepository(OperationLog)
          .countBy({
            yardId: yard.id,
            operationType: 'YARD_ZONE_CREATE' as never,
          }),
      ).toBe(1);
    });
    it('rolls back unexpected receipt, stray order and evidence together', async () => {
      const vin =
        'T' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
      jest
        .spyOn(audit, 'log')
        .mockRejectedValueOnce(new Error('audit unavailable'));
      await expect(
        inbound.registerUnexpectedVinAndScan(
          {
            vin,
            customerId: order.customerId,
            yardId: yard.id,
            slotId: slots[0].id,
            photoUrls: ['unexpected.jpg'],
          },
          user,
        ),
      ).rejects.toThrow('audit unavailable');
      expect(await db.getRepository(OrderVin).countBy({ vin })).toBe(0);
      expect(
        await db.getRepository(Order).countBy({ customerId: order.customerId }),
      ).toBe(1);
    });
    it('receives into stock, slot, vehicle record and immutable movement together', async () => {
      const v = await makeVin();
      await receive(v);
      expect((await active(v)).slotId).toBe(slots[0].id);
      expect(
        (await db.getRepository(OrderVin).findOneByOrFail({ id: v.id })).slotId,
      ).toBe(slots[0].id);
      const m = await db
        .getRepository(InventoryMovement)
        .findOneByOrFail({ vin: v.vin });
      expect(m).toMatchObject({
        kind: 'INBOUND',
        delta: 1,
        operatorUserId: user.userId,
      });
      await expect(
        db.query('DELETE FROM inventory_movements WHERE id=$1', [m.id]),
      ).rejects.toThrow('immutable');
    });
    it('rolls stock and slot back when the required audit insert fails', async () => {
      const v = await makeVin();
      jest
        .spyOn(audit, 'log')
        .mockRejectedValueOnce(new Error('audit unavailable'));
      await expect(receive(v)).rejects.toThrow('audit unavailable');
      expect(
        await db.getRepository(YardInventory).countBy({ vin: v.vin }),
      ).toBe(0);
      expect(
        await db.getRepository(InventoryMovement).countBy({ vin: v.vin }),
      ).toBe(0);
      expect(
        (await db.getRepository(YardSlot).findOneByOrFail({ id: slots[0].id }))
          .currentVin,
      ).toBeNull();
    });
    it('serializes simultaneous receipts of one VIN into different slots', async () => {
      const v = await makeVin();
      const results = await Promise.allSettled([
        receive(v, slots[0]),
        receive(v, slots[1]),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await db
          .getRepository(InventoryMovement)
          .countBy({ vin: v.vin, kind: 'INBOUND' }),
      ).toBe(1);
    });
    it('prevents two VINs occupying the same slot concurrently', async () => {
      const a = await makeVin(),
        b = await makeVin();
      const results = await Promise.allSettled([receive(a), receive(b)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('preserves arrival time on regular and bulk moves, and recognizes staging', async () => {
      const v = await makeVin();
      await receive(v);
      const entered = (await active(v)).enteredAt.getTime();
      await yards.moveSlot(slots[0].id, slots[1].id, scope, user.userId);
      const result = await yards.batchAssignSlots(
        yard.id,
        [{ vin: v.vin, slotCode: 'S-01-01' }],
        scope,
        user.userId,
      );
      expect(result.succeeded).toBe(1);
      expect(await active(v)).toMatchObject({
        position: 'STAGING',
        slotId: slots[5].id,
      });
      expect((await active(v)).enteredAt.getTime()).toBe(entered);
      expect(
        (
          await db.getRepository(YardSlot).findOneByOrFail({ id: slots[5].id })
        ).assignedAt!.getTime(),
      ).toBe(entered);
    });
    it('rejects bulk receiving and cross-yard moves', async () => {
      const v = await makeVin();
      expect(
        (
          await yards.batchAssignSlots(
            yard.id,
            [{ vin: v.vin, slotCode: 'P-01-01' }],
            scope,
            user.userId,
          )
        ).failed,
      ).toHaveLength(1);
      await receive(v);
      const other = await db.getRepository(Yard).save({
        organizationId: scope.activeOrgId,
        code: randomUUID(),
        name: 'Other',
      });
      expect(
        (
          await yards.batchAssignSlots(
            other.id,
            [{ vin: v.vin, slotCode: 'P-01-01' }],
            scope,
            user.userId,
          )
        ).failed,
      ).toHaveLength(1);
    });
    it('requires undo reason, retains before/after evidence and blocks allocated vehicles', async () => {
      const v = await makeVin();
      await receive(v);
      await expect(
        yards.undoInbound(v.vin, ' ', scope, user.userId),
      ).rejects.toThrow('原因');
      await makeWaybill([v]);
      await expect(
        yards.undoInbound(v.vin, 'mistake', scope, user.userId),
      ).rejects.toThrow('出库');
      await db.getRepository(OrderVin).update(v.id, { isAllocated: false });
      await yards.undoInbound(v.vin, 'Wrong receipt', scope, user.userId);
      const m = await db
        .getRepository(InventoryMovement)
        .findOneByOrFail({ vin: v.vin, kind: 'UNDO_INBOUND' });
      expect(m.beforeState?.vehicle).toMatchObject({
        arrivalPhotoUrls: ['test/arrival.jpg'],
      });
      expect(m.afterState.position).toBe('OFFSITE');
      expect(m.delta).toBe(-1);
    });
    it('separates counted stock adjustments from actual receipts and departures', async () => {
      const v = await makeVin();
      await yards.adjustInventory(
        {
          yardId: yard.id,
          vin: v.vin,
          direction: 'IN',
          slotId: slots[0].id,
          enteredAt: '2026-01-01T00:00:00Z',
          photoUrls: ['count.jpg'],
          reference: 'COUNT-1',
          reason: 'verified surplus',
        },
        scope,
        user.userId,
      );
      await yards.adjustInventory(
        {
          yardId: yard.id,
          vin: v.vin,
          direction: 'OUT',
          reference: 'COUNT-2',
          reason: 'verified shortage',
        },
        scope,
        user.userId,
      );
      const data = await dashboard.getDashboard(scope, { yardId: yard.id });
      expect(data.stockBalance).toMatchObject({
        inbound: 0,
        outbound: 0,
        adjustments: 0,
        closing: 0,
        actual: 0,
        difference: 0,
      });
    });
    it('commits planning and VIN allocation only with their audit', async () => {
      const v = await makeVin();
      await receive(v);
      const fixture = await makeWaybill([]);
      const outOrder = await db
        .getRepository(Order)
        .save({
          organizationId: scope.activeOrgId,
          orderCode: randomUUID(),
          customerId: order.customerId,
          transportType: TransportType.DELIVERY,
        });
      const dealer = await db
        .getRepository(CustomerAddress)
        .save({
          customerId: order.customerId!,
          code: 'STORE',
          dealerName: 'Test store',
          address: 'Test address',
        });
      await db
        .getRepository(OrderVin)
        .update(v.id, {
          outboundOrderId: outOrder.id,
          dealerCode: dealer.code,
        });
      const dto = {
        outboundOrderId: outOrder.id,
        orderVinIds: [v.id],
        carrierId: fixture.carrierId!,
        driverId: fixture.driverId!,
        vehicleId: fixture.vehicleId!,
        towType: VehicleTowType.TOWING,
      };
      const failure = jest
        .spyOn(audit, 'log')
        .mockRejectedValueOnce(new Error('audit unavailable'));
      await expect(
        outbound.planWaybill(dto, scope, user.userId),
      ).rejects.toThrow('audit unavailable');
      expect(
        await db.getRepository(Waybill).countBy({ orderId: outOrder.id }),
      ).toBe(0);
      expect(
        (await db.getRepository(OrderVin).findOneByOrFail({ id: v.id }))
          .isAllocated,
      ).toBe(false);
      failure.mockRestore();
      const planned = await outbound.planWaybill(dto, scope, user.userId);
      expect(
        await db
          .getRepository(OperationLog)
          .countBy({
            waybillId: planned.id,
            operationType: OperationType.WAYBILL_PLAN,
          }),
      ).toBe(1);
    });
    it('rolls back assignments and cancellations without audit, and retains the deleted waybill evidence', async () => {
      const v = await makeVin();
      await receive(v);
      const w = await makeWaybill([v]);
      const failure = jest
        .spyOn(audit, 'log')
        .mockRejectedValue(new Error('audit unavailable'));
      await expect(
        waybills.assignWaybill(w.id, { driverId: null }, scope, user.userId),
      ).rejects.toThrow('audit unavailable');
      expect(
        (await db.getRepository(Waybill).findOneByOrFail({ id: w.id }))
          .driverId,
      ).toBe(w.driverId);
      await expect(
        waybills.cancelWaybill(w.id, scope, user.userId),
      ).rejects.toThrow('audit unavailable');
      expect(
        (await db.getRepository(OrderVin).findOneByOrFail({ id: v.id }))
          .isAllocated,
      ).toBe(true);
      expect(
        await db.getRepository(WaybillVin).countBy({ waybillId: w.id }),
      ).toBe(1);
      failure.mockRestore();
      await waybills.assignWaybill(
        w.id,
        { driverId: null },
        scope,
        user.userId,
      );
      expect(
        await db
          .getRepository(OperationLog)
          .countBy({
            waybillId: w.id,
            operationType: OperationType.WAYBILL_ASSIGN,
          }),
      ).toBe(1);
      await waybills.cancelWaybill(w.id, scope, user.userId);
      expect(await db.getRepository(Waybill).countBy({ id: w.id })).toBe(0);
      const evidence = await db
        .getRepository(OperationLog)
        .findOneByOrFail({
          vin: v.vin,
          operationType: OperationType.WAYBILL_CANCEL,
        });
      expect(evidence.waybillId).toBeNull();
      expect(evidence.payload).toMatchObject({
        waybillId: w.id,
        waybillCode: w.waybillCode,
      });
      expect((await active(v)).position).toBe('PARKING');
    });
    it('rejects legacy departure and signing before departure', async () => {
      const v = await makeVin();
      await receive(v);
      await makeWaybill([v]);
      await expect(
        waybills.scan(
          { vin: v.vin, action: ScanAction.DELIVERY_DEPARTURE },
          user,
        ),
      ).rejects.toThrow('仅支持签收');
      await expect(
        waybills.scan({ vin: v.vin, action: ScanAction.SIGNED }, user),
      ).rejects.toThrow('已启运');
      expect((await active(v)).position).toBe('PARKING');
    });
    it('frees a loaded vehicle’s slot, keeps it on site, unloads into a chosen space and departs exactly once', async () => {
      const v = await makeVin();
      await receive(v);
      const w = await makeWaybill([v]);
      await waybills.loadVin(w.id, v.vin, ['load.jpg'], undefined, user);
      expect((await active(v)).position).toBe('LOADED');
      expect(await yards.yardStats(yard.id, scope)).toMatchObject({
        onSite: 1,
        loaded: 1,
        availableCapacity: 6,
      });
      expect((await yards.vinInventory(scope, {})).items).toHaveLength(1);
      const newcomer = await makeVin();
      await receive(newcomer);
      await expect(waybills.unloadVin(w.id, v.vin, user)).rejects.toThrow(
        '占用',
      );
      await waybills.unloadVin(w.id, v.vin, user, slots[1].id);
      expect((await active(v)).slotId).toBe(slots[1].id);
      await waybills.loadVin(w.id, v.vin, ['load2.jpg'], undefined, user);
      const results = await Promise.allSettled([
        waybills.departWaybill(w.id, [], undefined, user),
        waybills.departWaybill(w.id, [], undefined, user),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await db
          .getRepository(InventoryMovement)
          .countBy({ vin: v.vin, kind: 'DEPARTURE' }),
      ).toBe(1);
      await waybills.scan({ vin: v.vin, action: ScanAction.SIGNED }, user);
      const data = await dashboard.getDashboard(scope, { yardId: yard.id });
      expect(data.stockBalance).toMatchObject({
        inbound: 2,
        outbound: 1,
        closing: 1,
        actual: 1,
        difference: 0,
      });
    });
    it('rolls back all departure stock and status if tracking fails part-way', async () => {
      const a = await makeVin(),
        b = await makeVin();
      await receive(a);
      await receive(b, slots[1]);
      const w = await makeWaybill([a, b]);
      await waybills.loadVin(w.id, a.vin, ['load.jpg'], undefined, user);
      await waybills.loadVin(w.id, b.vin, ['load.jpg'], undefined, user);
      jest
        .spyOn(tracking, 'appendLog')
        .mockImplementationOnce(tracking.appendLog.bind(tracking))
        .mockRejectedValueOnce(new Error('tracking unavailable'));
      await expect(
        waybills.departWaybill(w.id, [], undefined, user),
      ).rejects.toThrow('tracking unavailable');
      expect((await active(a)).position).toBe('LOADED');
      expect((await active(b)).position).toBe('LOADED');
      expect(
        (await db.getRepository(Waybill).findOneByOrFail({ id: w.id })).status,
      ).toBe(WaybillStatus.NOT_ARRIVED);
      expect(
        await db
          .getRepository(InventoryMovement)
          .countBy({ waybillId: w.id, kind: 'DEPARTURE' }),
      ).toBe(0);
    });
    it('reports assignable rather than nominal empty space and uses the organization threshold', async () => {
      await db.getRepository(YardSlot).update(slots[0].id, { isLocked: true });
      await db.getRepository(YardZone).update(staging.id, { isActive: false });
      expect(await yards.yardStats(yard.id, scope)).toMatchObject({
        designCapacity: 6,
        enabledCapacity: 5,
        availableCapacity: 4,
        frozenCapacity: 1,
        disabledCapacity: 1,
        longStayDays: 3,
      });
      await db.getRepository(Yard).update(yard.id, { isActive: false });
      expect(await yards.yardStats(yard.id, scope)).toMatchObject({
        enabledCapacity: 0,
        availableCapacity: 0,
        disabledCapacity: 6,
      });
    });
    it('includes loaded vehicles and ledger movements in daily snapshots', async () => {
      const v = await makeVin();
      await receive(v);
      const w = await makeWaybill([v]);
      await waybills.loadVin(w.id, v.vin, ['load.jpg'], undefined, user);
      const snapshot = new DailySnapshotService(db, {} as never);
      const [policy] = await db.query(
        'SELECT * FROM organization_operating_policies WHERE organization_id=$1',
        [scope.activeOrgId],
      );
      await (
        snapshot as unknown as {
          captureOrganizationDay(p: unknown, d: string): Promise<void>;
        }
      ).captureOrganizationDay(policy, new Date().toISOString().slice(0, 10));
      const [row] = await db.query(
        'SELECT position,slot_id FROM inventory_daily_snapshots WHERE vin=$1',
        [v.vin],
      );
      expect(row).toMatchObject({ position: 'LOADED', slot_id: null });
      const [run] = await db.query(
        'SELECT inventory_count,inbound_count,is_consistent FROM daily_snapshot_runs WHERE organization_id=$1',
        [scope.activeOrgId],
      );
      expect(run).toMatchObject({
        inventory_count: 1,
        inbound_count: 1,
        is_consistent: true,
      });
    });
  },
);
