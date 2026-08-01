import { MigrationInterface, QueryRunner } from 'typeorm';

// Development reset migration. The legacy slot shape and its data are deliberately
// discarded; no code/row(varchar)/slotNo compatibility path remains.
export class YardZoneRefactor1788000000000 implements MigrationInterface {
  name = 'YardZoneRefactor1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A table DROP does not execute ON DELETE actions. Clear references explicitly
    // before removing the legacy table so the new FK constraints are valid.
    await queryRunner.query(`UPDATE "order_vins" SET "slot_id" = NULL WHERE "slot_id" IS NOT NULL`);
    await queryRunner.query(`UPDATE "operation_logs" SET "slot_id" = NULL WHERE "slot_id" IS NOT NULL`);
    await queryRunner.query(`TRUNCATE TABLE "inventory_daily_snapshots", "slot_daily_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "yard_slots" CASCADE`);

    await queryRunner.query(`
      CREATE TABLE "yard_zones" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "yard_id" uuid NOT NULL,
        "code" varchar NOT NULL,
        "name" varchar,
        "line_count" integer NOT NULL,
        "row_count" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "ck_yard_zones_line_count" CHECK ("line_count" BETWEEN 1 AND 999),
        CONSTRAINT "ck_yard_zones_row_count" CHECK ("row_count" BETWEEN 1 AND 999),
        CONSTRAINT "uq_yard_zones_id_yard" UNIQUE ("id", "yard_id"),
        CONSTRAINT "fk_yard_zones_yard" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_yard_zones_yard_code" ON "yard_zones" ("yard_id", "code")`,
    );

    await queryRunner.query(`
      CREATE TABLE "yard_slots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "yard_id" uuid NOT NULL,
        "zone_id" uuid NOT NULL,
        "line" integer NOT NULL,
        "row" integer NOT NULL,
        "status" "public"."yard_slots_status_enum" NOT NULL DEFAULT 'VACANT',
        "current_vin" varchar,
        "assigned_at" TIMESTAMP WITH TIME ZONE,
        "is_locked" boolean NOT NULL DEFAULT false,
        "locked_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "ck_yard_slots_line" CHECK ("line" BETWEEN 1 AND 999),
        CONSTRAINT "ck_yard_slots_row" CHECK ("row" BETWEEN 1 AND 999),
        CONSTRAINT "fk_yard_slots_yard" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_yard_slots_zone_yard" FOREIGN KEY ("zone_id", "yard_id") REFERENCES "yard_zones"("id", "yard_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_yard_slots_zone_line_row" ON "yard_slots" ("zone_id", "line", "row")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_yard_slots_yard_status" ON "yard_slots" ("yard_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_yard_slots_current_vin" ON "yard_slots" ("current_vin") WHERE "current_vin" IS NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "order_vins"
      ADD CONSTRAINT "FK_order_vins_slot"
      FOREIGN KEY ("slot_id") REFERENCES "yard_slots"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "operation_logs"
      ADD CONSTRAINT "fk_operation_logs_slot"
      FOREIGN KEY ("slot_id") REFERENCES "yard_slots"("id") ON DELETE SET NULL
    `);

    // Preserve the display code at event time. Zone renames create a synthetic slot
    // state event for every slot, so historical snapshots do not depend on live Zone data.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_yard_slot_state()
      RETURNS trigger AS $$
      DECLARE source_yard_id uuid;
      DECLARE source_org_id uuid;
      DECLARE source_zone_code varchar;
      DECLARE row_state jsonb;
      BEGIN
        source_yard_id := COALESCE(NEW.yard_id, OLD.yard_id);
        SELECT organization_id INTO source_org_id FROM yards WHERE id = source_yard_id;
        SELECT code INTO source_zone_code
        FROM yard_zones WHERE id = COALESCE(NEW.zone_id, OLD.zone_id);
        row_state := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)
          || jsonb_build_object('zone_code', source_zone_code);
        INSERT INTO yard_slot_state_events (
          organization_id, yard_id, slot_id, event_type, occurred_at, state
        ) VALUES (
          source_org_id, source_yard_id, COALESCE(NEW.id, OLD.id),
          CASE TG_OP
            WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum
            WHEN 'UPDATE' THEN 'UPDATED'::state_event_type_enum
            ELSE 'DELETED'::state_event_type_enum
          END,
          NOW(), row_state
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_audit_yard_slot_state"
      AFTER INSERT OR UPDATE OR DELETE ON "yard_slots"
      FOR EACH ROW EXECUTE FUNCTION audit_yard_slot_state()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_yard_zone_code_change()
      RETURNS trigger AS $$
      DECLARE source_org_id uuid;
      BEGIN
        IF OLD.code IS NOT DISTINCT FROM NEW.code THEN RETURN NEW; END IF;
        SELECT organization_id INTO source_org_id FROM yards WHERE id = NEW.yard_id;
        INSERT INTO yard_slot_state_events (
          organization_id, yard_id, slot_id, event_type, occurred_at, state
        )
        SELECT source_org_id, slot.yard_id, slot.id, 'UPDATED'::state_event_type_enum,
          NOW(), to_jsonb(slot) || jsonb_build_object('zone_code', NEW.code)
        FROM yard_slots slot WHERE slot.zone_id = NEW.id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_audit_yard_zone_code_change"
      AFTER UPDATE OF "code" ON "yard_zones"
      FOR EACH ROW EXECUTE FUNCTION audit_yard_zone_code_change()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_yard_slot_locked_at()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.is_locked = true
          AND (OLD.is_locked = false OR NEW.locked_at IS NULL) THEN
          NEW.locked_at = NOW();
        ELSIF NEW.is_locked = false THEN
          NEW.locked_at = NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_yard_slot_locked_at"
      BEFORE UPDATE ON "yard_slots"
      FOR EACH ROW EXECUTE FUNCTION set_yard_slot_locked_at()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_duplicate_occupied_vin()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'OCCUPIED' AND NEW.current_vin IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM yard_slots other
            WHERE other.id <> NEW.id
              AND other.status = 'OCCUPIED'
              AND other.current_vin = NEW.current_vin
          )
        THEN
          RAISE EXCEPTION 'VIN % 已占用其他库位', NEW.current_vin
            USING ERRCODE = 'unique_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_prevent_duplicate_occupied_vin"
      BEFORE INSERT OR UPDATE ON "yard_slots"
      FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_occupied_vin()
    `);

    await queryRunner.query(`
      ALTER TABLE "slot_daily_snapshots"
        DROP COLUMN IF EXISTS "row_code",
        DROP COLUMN IF EXISTS "slot_no",
        ADD COLUMN "zone_id" uuid,
        ADD COLUMN "zone_code" varchar,
        ADD COLUMN "line" integer,
        ADD COLUMN "row" integer
    `);
  }

  public async down(): Promise<void> {
    throw new Error('YardZoneRefactor is irreversible in the development reset flow');
  }
}
