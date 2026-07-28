import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationDailyOperationalSnapshots1787000000000 implements MigrationInterface {
  name = 'OrganizationDailyOperationalSnapshots1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organization_operating_policies" (
        "organization_id" uuid NOT NULL,
        "timezone" varchar NOT NULL,
        "business_day_cutoff" time NOT NULL,
        "snapshot_enabled" boolean NOT NULL,
        "snapshot_started_at" timestamptz NOT NULL,
        "long_stay_days" integer NOT NULL,
        "lock_timeout_hours" integer NOT NULL,
        "utilization_warning_percent" numeric(5,2) NOT NULL,
        "utilization_critical_percent" numeric(5,2) NOT NULL,
        "expected_arrival_warning_hours" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_organization_operating_policies"
          PRIMARY KEY ("organization_id"),
        CONSTRAINT "FK_operating_policy_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "CK_policy_utilization_thresholds"
          CHECK ("utilization_warning_percent" < "utilization_critical_percent"),
        CONSTRAINT "CK_policy_positive_values"
          CHECK ("long_stay_days" > 0 AND "lock_timeout_hours" > 0
            AND "expected_arrival_warning_hours" > 0)
      )
    `);

    // 一次性初始化现有机构。此后调度完全读取策略表，不按国家代码分支。
    await queryRunner.query(`
      INSERT INTO "organization_operating_policies" (
        organization_id, timezone, business_day_cutoff, snapshot_enabled,
        snapshot_started_at, long_stay_days, lock_timeout_hours,
        utilization_warning_percent, utilization_critical_percent,
        expected_arrival_warning_hours
      )
      SELECT
        id,
        CASE code
          WHEN 'ID' THEN 'Asia/Jakarta'
          WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
          WHEN 'TH' THEN 'Asia/Bangkok'
          WHEN 'VN' THEN 'Asia/Ho_Chi_Minh'
          WHEN 'PH' THEN 'Asia/Manila'
          ELSE 'UTC'
        END,
        TIME '02:00:00',
        true,
        NOW(),
        7,
        24,
        80,
        90,
        24
      FROM organizations
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."state_event_type_enum"
      AS ENUM ('BASELINE', 'CREATED', 'UPDATED', 'DELETED')
    `);
    await queryRunner.query(`
      CREATE TABLE "yard_state_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "event_type" "public"."state_event_type_enum" NOT NULL,
        "occurred_at" timestamptz NOT NULL DEFAULT NOW(),
        "transaction_id" bigint NOT NULL DEFAULT txid_current(),
        "state" jsonb,
        CONSTRAINT "PK_yard_state_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_yard_state_event_asof"
      ON "yard_state_events" ("organization_id", "yard_id", "occurred_at" DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE "yard_slot_state_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "event_type" "public"."state_event_type_enum" NOT NULL,
        "occurred_at" timestamptz NOT NULL DEFAULT NOW(),
        "transaction_id" bigint NOT NULL DEFAULT txid_current(),
        "state" jsonb,
        CONSTRAINT "PK_yard_slot_state_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_slot_state_event_asof"
      ON "yard_slot_state_events"
      ("organization_id", "slot_id", "occurred_at" DESC)
    `);

    await queryRunner.query(`
      INSERT INTO yard_state_events (
        organization_id, yard_id, event_type, occurred_at, state
      )
      SELECT organization_id, id, 'BASELINE', NOW(), to_jsonb(y)
      FROM yards y
    `);
    await queryRunner.query(`
      INSERT INTO yard_slot_state_events (
        organization_id, yard_id, slot_id, event_type, occurred_at, state
      )
      SELECT y.organization_id, s.yard_id, s.id, 'BASELINE', NOW(), to_jsonb(s)
      FROM yard_slots s JOIN yards y ON y.id = s.yard_id
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_yard_state()
      RETURNS trigger AS $$
      DECLARE row_state jsonb;
      BEGIN
        row_state := CASE WHEN TG_OP = 'DELETE'
          THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        INSERT INTO yard_state_events (
          organization_id, yard_id, event_type, occurred_at, state
        ) VALUES (
          COALESCE(NEW.organization_id, OLD.organization_id),
          COALESCE(NEW.id, OLD.id),
          CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum
            WHEN 'UPDATE' THEN 'UPDATED'::state_event_type_enum
            ELSE 'DELETED'::state_event_type_enum
          END,
          NOW(),
          row_state
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_audit_yard_state"
      AFTER INSERT OR UPDATE OR DELETE ON yards
      FOR EACH ROW EXECUTE FUNCTION audit_yard_state()
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_yard_slot_state()
      RETURNS trigger AS $$
      DECLARE source_row yard_slots%ROWTYPE;
      DECLARE source_yard_id uuid;
      DECLARE source_org_id uuid;
      DECLARE row_state jsonb;
      BEGIN
        source_yard_id := COALESCE(NEW.yard_id, OLD.yard_id);
        SELECT organization_id INTO source_org_id
        FROM yards WHERE id = source_yard_id;
        row_state := CASE WHEN TG_OP = 'DELETE'
          THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        INSERT INTO yard_slot_state_events (
          organization_id, yard_id, slot_id, event_type, occurred_at, state
        ) VALUES (
          source_org_id,
          source_yard_id,
          COALESCE(NEW.id, OLD.id),
          CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum
            WHEN 'UPDATE' THEN 'UPDATED'::state_event_type_enum
            ELSE 'DELETED'::state_event_type_enum
          END,
          NOW(),
          row_state
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_audit_yard_slot_state"
      AFTER INSERT OR UPDATE OR DELETE ON yard_slots
      FOR EACH ROW EXECUTE FUNCTION audit_yard_slot_state()
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."daily_snapshot_run_status_enum"
      AS ENUM ('STARTED', 'COMPLETED', 'FAILED')
    `);
    await queryRunner.query(`
      CREATE TABLE "daily_snapshot_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "business_date" date NOT NULL,
        "timezone" varchar NOT NULL,
        "business_day_cutoff" time NOT NULL,
        "window_start" timestamptz NOT NULL,
        "window_end" timestamptz NOT NULL,
        "policy" jsonb NOT NULL,
        "status" "public"."daily_snapshot_run_status_enum" NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT NOW(),
        "completed_at" timestamptz,
        "error_message" text,
        "yard_count" integer,
        "slot_count" integer,
        "inventory_count" integer,
        "inbound_count" integer,
        "outbound_count" integer,
        "is_consistent" boolean,
        "quality_issues" jsonb,
        CONSTRAINT "PK_daily_snapshot_runs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_daily_snapshot_run_org_date"
          UNIQUE ("organization_id", "business_date")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "yard_daily_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "snapshot_run_id" uuid NOT NULL,
        "business_date" date NOT NULL,
        "organization_id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "yard_code" varchar NOT NULL,
        "yard_name" varchar NOT NULL,
        "yard_address" varchar,
        "is_active" boolean NOT NULL,
        "total_slots" integer NOT NULL,
        "used_slots" integer NOT NULL,
        "locked_slots" integer NOT NULL,
        "long_stay_slots" integer NOT NULL,
        "vehicles_on_site" integer NOT NULL,
        "captured_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_yard_daily_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_yard_daily_snapshot"
          UNIQUE ("business_date", "yard_id"),
        CONSTRAINT "FK_yard_daily_snapshot_run"
          FOREIGN KEY ("snapshot_run_id") REFERENCES daily_snapshot_runs(id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_yard_daily_org_date"
      ON yard_daily_snapshots ("organization_id", "business_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "slot_daily_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "snapshot_run_id" uuid NOT NULL,
        "business_date" date NOT NULL,
        "organization_id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "slot_code" varchar NOT NULL,
        "row_code" varchar,
        "slot_no" varchar,
        "status" varchar NOT NULL,
        "current_vin" varchar,
        "assigned_at" timestamptz,
        "is_locked" boolean NOT NULL,
        "locked_at" timestamptz,
        "captured_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_slot_daily_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_slot_daily_snapshot"
          UNIQUE ("business_date", "slot_id"),
        CONSTRAINT "FK_slot_daily_snapshot_run"
          FOREIGN KEY ("snapshot_run_id") REFERENCES daily_snapshot_runs(id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_slot_daily_yard_date"
      ON slot_daily_snapshots ("yard_id", "business_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_slot_daily_vin_date"
      ON slot_daily_snapshots ("current_vin", "business_date")
      WHERE "current_vin" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_daily_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "snapshot_run_id" uuid NOT NULL,
        "business_date" date NOT NULL,
        "organization_id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "slot_code" varchar NOT NULL,
        "vin" varchar NOT NULL,
        "assigned_at" timestamptz,
        "stay_days" integer NOT NULL,
        "order_id" uuid,
        "order_vin_slot_id" uuid,
        "order_code" varchar,
        "customer_id" uuid,
        "brand" varchar,
        "model" varchar,
        "color" varchar,
        "vehicle_type" varchar,
        "captured_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_inventory_daily_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_daily_org_slot"
          UNIQUE ("business_date", "organization_id", "slot_id"),
        CONSTRAINT "FK_inventory_daily_snapshot_run"
          FOREIGN KEY ("snapshot_run_id") REFERENCES daily_snapshot_runs(id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_daily_yard_date"
      ON inventory_daily_snapshots ("yard_id", "business_date")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."daily_movement_type_enum"
      AS ENUM ('INBOUND', 'OUTBOUND')
    `);
    await queryRunner.query(`
      CREATE TABLE "vehicle_movement_daily_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "snapshot_run_id" uuid NOT NULL,
        "business_date" date NOT NULL,
        "organization_id" uuid NOT NULL,
        "movement_type" "public"."daily_movement_type_enum" NOT NULL,
        "source_type" varchar NOT NULL,
        "source_id" uuid NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "vin" varchar NOT NULL,
        "yard_id" uuid,
        "slot_id" uuid,
        "order_id" uuid,
        "waybill_id" uuid,
        "captured_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_vehicle_movement_daily_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vehicle_movement_snapshot_source"
          UNIQUE ("source_type", "source_id"),
        CONSTRAINT "FK_vehicle_movement_snapshot_run"
          FOREIGN KEY ("snapshot_run_id") REFERENCES daily_snapshot_runs(id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_vehicle_movement_org_date_type"
      ON vehicle_movement_daily_snapshots
      ("organization_id", "business_date", "movement_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "vehicle_movement_daily_snapshots"`);
    await queryRunner.query(`DROP TYPE "public"."daily_movement_type_enum"`);
    await queryRunner.query(`DROP TABLE "inventory_daily_snapshots"`);
    await queryRunner.query(`DROP TABLE "slot_daily_snapshots"`);
    await queryRunner.query(`DROP TABLE "yard_daily_snapshots"`);
    await queryRunner.query(`DROP TABLE "daily_snapshot_runs"`);
    await queryRunner.query(
      `DROP TYPE "public"."daily_snapshot_run_status_enum"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_audit_yard_slot_state" ON yard_slots`,
    );
    await queryRunner.query(`DROP FUNCTION audit_yard_slot_state`);
    await queryRunner.query(`DROP TRIGGER "TRG_audit_yard_state" ON yards`);
    await queryRunner.query(`DROP FUNCTION audit_yard_state`);
    await queryRunner.query(`DROP TABLE "yard_slot_state_events"`);
    await queryRunner.query(`DROP TABLE "yard_state_events"`);
    await queryRunner.query(`DROP TYPE "public"."state_event_type_enum"`);
    await queryRunner.query(`DROP TABLE "organization_operating_policies"`);
  }
}
