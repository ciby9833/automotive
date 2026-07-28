import { MigrationInterface, QueryRunner } from 'typeorm';

export class SnapshotIntegrityGuards1787100000000 implements MigrationInterface {
  name = 'SnapshotIntegrityGuards1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "order_vin_state_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "order_vin_id" uuid NOT NULL,
        "vin" varchar NOT NULL,
        "event_type" "public"."state_event_type_enum" NOT NULL,
        "occurred_at" timestamptz NOT NULL DEFAULT NOW(),
        "transaction_id" bigint NOT NULL DEFAULT txid_current(),
        "state" jsonb,
        CONSTRAINT "PK_order_vin_state_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_vin_state_event_asof"
      ON order_vin_state_events
      ("organization_id", "vin", "occurred_at" DESC)
    `);
    await queryRunner.query(`
      INSERT INTO order_vin_state_events (
        organization_id, order_vin_id, vin, event_type, occurred_at, state
      )
      SELECT o.organization_id, ov.id, ov.vin, 'BASELINE', NOW(), to_jsonb(ov)
      FROM order_vins ov JOIN orders o ON o.id = ov.order_id
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_order_vin_state()
      RETURNS trigger AS $$
      DECLARE source_org_id uuid;
      DECLARE source_order_id uuid;
      DECLARE row_state jsonb;
      BEGIN
        source_order_id := CASE WHEN TG_OP = 'DELETE'
          THEN OLD.order_id ELSE NEW.order_id END;
        SELECT organization_id INTO source_org_id
        FROM orders WHERE id = source_order_id;
        row_state := CASE WHEN TG_OP = 'DELETE'
          THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        INSERT INTO order_vin_state_events (
          organization_id, order_vin_id, vin, event_type, occurred_at, state
        ) VALUES (
          source_org_id,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.vin ELSE NEW.vin END,
          CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum
            WHEN 'UPDATE' THEN 'UPDATED'::state_event_type_enum
            ELSE 'DELETED'::state_event_type_enum
          END,
          NOW(),
          row_state
        );
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_audit_order_vin_state"
      AFTER INSERT OR UPDATE OR DELETE ON order_vins
      FOR EACH ROW EXECUTE FUNCTION audit_order_vin_state()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_yard_slot_state()
      RETURNS trigger AS $$
      DECLARE source_yard_id uuid;
      DECLARE source_org_id uuid;
      DECLARE row_state jsonb;
      BEGIN
        source_yard_id := CASE WHEN TG_OP = 'DELETE'
          THEN OLD.yard_id ELSE NEW.yard_id END;
        SELECT organization_id INTO source_org_id
        FROM yards WHERE id = source_yard_id;
        IF source_org_id IS NULL THEN
          SELECT organization_id INTO source_org_id
          FROM yard_state_events
          WHERE yard_id = source_yard_id
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1;
        END IF;
        row_state := CASE WHEN TG_OP = 'DELETE'
          THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        INSERT INTO yard_slot_state_events (
          organization_id, yard_id, slot_id, event_type, occurred_at, state
        ) VALUES (
          source_org_id,
          source_yard_id,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum
            WHEN 'UPDATE' THEN 'UPDATED'::state_event_type_enum
            ELSE 'DELETED'::state_event_type_enum
          END,
          NOW(),
          row_state
        );
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
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
          CASE WHEN TG_OP = 'DELETE'
            THEN OLD.organization_id ELSE NEW.organization_id END,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum
            WHEN 'UPDATE' THEN 'UPDATED'::state_event_type_enum
            ELSE 'DELETED'::state_event_type_enum
          END,
          NOW(),
          row_state
        );
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // 现存异常由一致性报告暴露；此触发器阻止异常继续扩大。
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_duplicate_occupied_vin()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'OCCUPIED' AND NEW."currentVin" IS NOT NULL
          AND (
            TG_OP = 'INSERT'
            OR OLD.status IS DISTINCT FROM NEW.status
            OR OLD."currentVin" IS DISTINCT FROM NEW."currentVin"
          )
          AND EXISTS (
            SELECT 1 FROM yard_slots other
            WHERE other.id <> NEW.id
              AND other.status = 'OCCUPIED'
              AND other."currentVin" = NEW."currentVin"
          )
        THEN
          RAISE EXCEPTION 'VIN % 已占用其他库位', NEW."currentVin"
            USING ERRCODE = 'unique_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_prevent_duplicate_occupied_vin"
      BEFORE INSERT OR UPDATE ON yard_slots
      FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_occupied_vin()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_daily_snapshot_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '每日快照是不可变事实，不允许更新或删除';
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of [
      'yard_daily_snapshots',
      'slot_daily_snapshots',
      'inventory_daily_snapshots',
      'vehicle_movement_daily_snapshots',
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER "TRG_${table}_immutable"
        BEFORE UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION prevent_daily_snapshot_mutation()
      `);
    }

    await queryRunner.query(`
      CREATE INDEX "IDX_operation_log_dashboard_activity"
      ON operation_logs ("yard_id", "event_at", "operation_type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_waybill_log_dashboard_activity"
      ON waybill_status_logs ("yard_id", "created_at", "action")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_waybill_log_dashboard_activity"`);
    await queryRunner.query(
      `DROP INDEX "IDX_operation_log_dashboard_activity"`,
    );
    for (const table of [
      'vehicle_movement_daily_snapshots',
      'inventory_daily_snapshots',
      'slot_daily_snapshots',
      'yard_daily_snapshots',
    ]) {
      await queryRunner.query(
        `DROP TRIGGER "TRG_${table}_immutable" ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION prevent_daily_snapshot_mutation`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_prevent_duplicate_occupied_vin" ON yard_slots`,
    );
    await queryRunner.query(`DROP FUNCTION prevent_duplicate_occupied_vin`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_audit_order_vin_state" ON order_vins`,
    );
    await queryRunner.query(`DROP FUNCTION audit_order_vin_state`);
    await queryRunner.query(`DROP TABLE order_vin_state_events`);
  }
}
