import { MigrationInterface, QueryRunner } from 'typeorm';

export class DriverPositionsTimescale1787600000000
  implements MigrationInterface
{
  name = 'DriverPositionsTimescale1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_positions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "captured_at" timestamptz NOT NULL,
        "driver_user_id" uuid NOT NULL,
        "carrier_id" uuid,
        "waybill_id" uuid,
        "order_id" uuid,
        "vin" varchar,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "accuracy" double precision,
        "speed" double precision,
        "heading" double precision,
        "battery_level" double precision,
        "is_charging" boolean,
        "source" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_driver_positions" PRIMARY KEY ("id", "captured_at")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_positions_driver_user'
        ) THEN
          ALTER TABLE "driver_positions"
          ADD CONSTRAINT "fk_driver_positions_driver_user"
          FOREIGN KEY ("driver_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_positions_carrier'
        ) THEN
          ALTER TABLE "driver_positions"
          ADD CONSTRAINT "fk_driver_positions_carrier"
          FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_positions_waybill'
        ) THEN
          ALTER TABLE "driver_positions"
          ADD CONSTRAINT "fk_driver_positions_waybill"
          FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_positions_order'
        ) THEN
          ALTER TABLE "driver_positions"
          ADD CONSTRAINT "fk_driver_positions_order"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_driver_positions_driver_time"
        ON "driver_positions" ("driver_user_id", "captured_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_driver_positions_carrier_time"
        ON "driver_positions" ("carrier_id", "captured_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_driver_positions_waybill_time"
        ON "driver_positions" ("waybill_id", "captured_at" DESC)`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'
        ) THEN
          CREATE EXTENSION IF NOT EXISTS timescaledb;
        ELSE
          RAISE NOTICE 'TimescaleDB extension is not installed; driver_positions remains a regular table';
        END IF;

        IF EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = 'create_hypertable'
            AND n.nspname = 'public'
        ) THEN
          PERFORM create_hypertable(
            'driver_positions',
            'captured_at',
            if_not_exists => TRUE,
            migrate_data => TRUE
          );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "driver_positions"`);
  }
}
