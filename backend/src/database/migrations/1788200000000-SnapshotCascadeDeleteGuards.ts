import { MigrationInterface, QueryRunner } from 'typeorm';

// Parent-row cascades can delete the parent before the child AFTER DELETE trigger
// runs. Resolve organization/zone facts from the immutable event stream when the
// live parent is already gone, so cleanup and real cascade deletes stay auditable.
export class SnapshotCascadeDeleteGuards1788200000000
  implements MigrationInterface
{
  name = 'SnapshotCascadeDeleteGuards1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        IF source_org_id IS NULL THEN
          SELECT organization_id INTO source_org_id
          FROM order_vin_state_events
          WHERE order_vin_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1;
        END IF;
        IF source_org_id IS NULL THEN
          RAISE EXCEPTION '无法解析 order_vin % 的机构归属',
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
        END IF;
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
      CREATE OR REPLACE FUNCTION audit_yard_slot_state()
      RETURNS trigger AS $$
      DECLARE source_yard_id uuid;
      DECLARE source_org_id uuid;
      DECLARE source_slot_id uuid;
      DECLARE source_zone_code varchar;
      DECLARE row_state jsonb;
      BEGIN
        source_yard_id := COALESCE(NEW.yard_id, OLD.yard_id);
        source_slot_id := COALESCE(NEW.id, OLD.id);
        SELECT organization_id INTO source_org_id
        FROM yards WHERE id = source_yard_id;
        IF source_org_id IS NULL THEN
          SELECT organization_id INTO source_org_id
          FROM yard_state_events
          WHERE yard_id = source_yard_id
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1;
        END IF;
        SELECT code INTO source_zone_code
        FROM yard_zones WHERE id = COALESCE(NEW.zone_id, OLD.zone_id);
        IF source_zone_code IS NULL THEN
          SELECT state->>'zone_code' INTO source_zone_code
          FROM yard_slot_state_events
          WHERE slot_id = source_slot_id
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1;
        END IF;
        IF source_org_id IS NULL THEN
          RAISE EXCEPTION '无法解析 yard_slot % 的机构归属', source_slot_id;
        END IF;
        row_state := (CASE WHEN TG_OP = 'DELETE'
          THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)
          || jsonb_build_object('zone_code', source_zone_code);
        INSERT INTO yard_slot_state_events (
          organization_id, yard_id, slot_id, event_type, occurred_at, state
        ) VALUES (
          source_org_id, source_yard_id, source_slot_id,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
          NOW(), row_state
        );
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

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
  }
}
