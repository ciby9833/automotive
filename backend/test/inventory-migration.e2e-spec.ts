import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { Organization } from '../src/modules/organizations/entities/organization.entity';
import { Yard } from '../src/modules/yards/entities/yard.entity';
import {
  YardSlot,
  YardSlotStatus,
} from '../src/modules/yards/entities/yard-slot.entity';
import { Customer } from '../src/modules/customers/entities/customer.entity';
import { Order } from '../src/modules/orders/entities/order.entity';
import { OrderVin } from '../src/modules/orders/entities/order-vin.entity';
import { Waybill } from '../src/modules/waybills/entities/waybill.entity';
import { WaybillVin } from '../src/modules/waybills/entities/waybill-vin.entity';
import { Currency } from '../src/common/enums/currency.enum';
import { TransportType } from '../src/common/enums/order-type.enum';
import { OrderVinArrivalStatus } from '../src/common/enums/order-vin-status.enum';

const database = process.env.INVENTORY_MIGRATION_TEST_DB;
if (database && !/^alms_inventory_test_\d+$/.test(database))
  throw new Error(
    'Use a new disposable alms_inventory_test_<timestamp> database',
  );
(database ? describe : describe.skip)(
  'inventory migration with existing stock',
  () => {
    let db: DataSource;
    beforeAll(async () => {
      db = new DataSource({
        ...AppDataSource.options,
        database,
        logging: false,
        synchronize: false,
      });
      await db.initialize();
      const [existing] = await db.query(
        "SELECT to_regclass('public.orders') AS table",
      );
      if (existing.table)
        throw new Error('Migration test requires a fresh, empty database');
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    it('rejects ambiguous stock, preserves arrival dates, converts already-loaded vehicles and creates only opening balances', async () => {
      const migrations = db.migrations;
      db.migrations = migrations.filter(
        (m) => m.name !== 'InventoryLedger1790300000000',
      );
      await db.runMigrations({ transaction: 'each' });
      db.migrations = migrations;
      const org = await db
        .getRepository(Organization)
        .save({
          code: 'MIGRATION',
          name: 'Migration fixture',
          defaultCurrency: Currency.IDR,
        });
      const yard = await db
        .getRepository(Yard)
        .save({
          organizationId: org.id,
          code: 'MIGRATION',
          name: 'Migration yard',
        });
      const [zone] = await db.query(
        "INSERT INTO yard_zones(yard_id,code,line_count,row_count) VALUES($1,'P',1,2) RETURNING id",
        [yard.id],
      );
      const slots = await db
        .getRepository(YardSlot)
        .save(
          [1, 2].map((row) => ({
            yardId: yard.id,
            zoneId: zone.id,
            line: 1,
            row,
          })),
        );
      const customer = await db
        .getRepository(Customer)
        .save({ organizationId: org.id, name: 'Customer' });
      const order = await db
        .getRepository(Order)
        .save({
          organizationId: org.id,
          orderCode: 'MIGRATION',
          customerId: customer.id,
          destinationYardId: yard.id,
          transportType: TransportType.TRANSFER,
        });
      const entered = new Date('2026-08-01T00:00:00Z');
      const vins = await db
        .getRepository(OrderVin)
        .save(
          slots.map((s, i) => ({
            orderId: order.id,
            vin: `MIGRATION0000000${i}`,
            slotId: i ? null : s.id,
            arrivedAt: entered,
            arrivalStatus: OrderVinArrivalStatus.ARRIVED,
          })),
        );
      for (let i = 0; i < 2; i++)
        await db
          .getRepository(YardSlot)
          .update(slots[i].id, {
            status: YardSlotStatus.OCCUPIED,
            currentVin: vins[i].vin,
            assignedAt: new Date(),
          });
      const waybill = await db
        .getRepository(Waybill)
        .save({
          organizationId: org.id,
          waybillCode: 'MIGRATION',
          originYardId: yard.id,
          transportType: TransportType.DELIVERY,
          orderId: order.id,
        });
      await db
        .getRepository(WaybillVin)
        .save({
          waybillId: waybill.id,
          vin: vins[0].vin,
          loadedAt: new Date(),
          loadPhotoKeys: ['loaded.jpg'],
        });
      await expect(db.runMigrations({ transaction: 'each' })).rejects.toThrow(
        'reconcile occupied slots',
      );
      await db
        .getRepository(OrderVin)
        .update(vins[1].id, { slotId: slots[1].id });
      await db.runMigrations({ transaction: 'each' });
      const rows = await db.query(
        'SELECT vin,entered_at,position,slot_id FROM yard_inventory ORDER BY vin',
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ position: 'LOADED', slot_id: null });
      expect(rows[1]).toMatchObject({
        position: 'PARKING',
        slot_id: slots[1].id,
      });
      expect(
        rows.every((r) => r.entered_at.getTime() === entered.getTime()),
      ).toBe(true);
      const ledger = await db.query(
        'SELECT kind,delta FROM inventory_movements',
      );
      expect(ledger).toEqual([
        { kind: 'OPENING', delta: 1 },
        { kind: 'OPENING', delta: 1 },
      ]);
      expect(
        (await db.getRepository(YardSlot).findOneByOrFail({ id: slots[0].id }))
          .status,
      ).toBe(YardSlotStatus.VACANT);
      expect(
        (
          await db.getRepository(YardSlot).findOneByOrFail({ id: slots[1].id })
        ).assignedAt?.getTime(),
      ).toBe(entered.getTime());
    }, 30000);
  },
);
