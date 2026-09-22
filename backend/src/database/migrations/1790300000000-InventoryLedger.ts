import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventoryLedger1790300000000 implements MigrationInterface {
  name = 'InventoryLedger1790300000000';
  async up(q: QueryRunner): Promise<void> {
    // Refuse to invent stock ownership or entry dates during conversion.
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM yard_slots s LEFT JOIN order_vins v ON v.slot_id=s.id AND v.vin=s.current_vin
        LEFT JOIN orders o ON o.id=v.order_id LEFT JOIN yards y ON y.id=s.yard_id
        WHERE s.status='OCCUPIED' AND (v.id IS NULL OR v.arrived_at IS NULL OR v.arrival_status<>'ARRIVED'
          OR o.organization_id<>y.organization_id))
        OR EXISTS (SELECT current_vin FROM yard_slots WHERE status='OCCUPIED' GROUP BY current_vin HAVING count(*)>1)
        OR EXISTS (SELECT slot_id FROM order_vins WHERE slot_id IS NOT NULL GROUP BY slot_id HAVING count(*)>1)
        OR EXISTS (SELECT 1 FROM order_vins v JOIN yard_slots s ON s.id=v.slot_id
          WHERE s.status<>'OCCUPIED' OR s.current_vin IS DISTINCT FROM v.vin)
      THEN RAISE EXCEPTION 'Inventory migration blocked: reconcile occupied slots, VIN ownership and arrival timestamps first'; END IF;
    END $$`);
    for (const value of [
      'INVENTORY_ADJUST',
      'INVENTORY_STATUS',
      'YARD_ZONE_CREATE',
      'YARD_ZONE_UPDATE',
      'YARD_ZONE_DELETE',
      'YARD_ZONE_GENERATE_SLOTS',
    ]) {
      await q.query(
        `ALTER TYPE operation_logs_operation_type_enum ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
    await q.query(
      `ALTER TABLE yard_zones ADD COLUMN purpose varchar NOT NULL DEFAULT 'PARKING' CHECK (purpose IN ('PARKING','STAGING'))`,
    );
    await q.query(`CREATE OR REPLACE FUNCTION audit_yard_slot_state() RETURNS trigger AS $$
      DECLARE r jsonb; org uuid; z yard_zones%ROWTYPE;
      BEGIN
        r := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        SELECT organization_id INTO org FROM yards WHERE id=(r->>'yard_id')::uuid;
        SELECT * INTO z FROM yard_zones WHERE id=(r->>'zone_id')::uuid;
        INSERT INTO yard_slot_state_events(organization_id,yard_id,slot_id,event_type,occurred_at,state)
        VALUES(org,(r->>'yard_id')::uuid,(r->>'id')::uuid,
          CASE TG_OP WHEN 'INSERT' THEN 'CREATED'::state_event_type_enum WHEN 'DELETE' THEN 'DELETED'::state_event_type_enum ELSE 'UPDATED'::state_event_type_enum END,
          clock_timestamp(),r||jsonb_build_object('zone_code',z.code,'zone_is_active',z.is_active,'zone_purpose',z.purpose));
        RETURN COALESCE(NEW,OLD);
      END $$ LANGUAGE plpgsql`);
    await q.query(`CREATE OR REPLACE FUNCTION audit_yard_zone_code_change() RETURNS trigger AS $$
      BEGIN
        INSERT INTO yard_slot_state_events(organization_id,yard_id,slot_id,event_type,occurred_at,state)
        SELECT y.organization_id,s.yard_id,s.id,'UPDATED',clock_timestamp(),to_jsonb(s)||jsonb_build_object(
          'zone_code',NEW.code,'zone_is_active',NEW.is_active,'zone_purpose',NEW.purpose)
        FROM yard_slots s JOIN yards y ON y.id=s.yard_id WHERE s.zone_id=NEW.id;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q.query(
      `DROP TRIGGER "TRG_audit_yard_zone_code_change" ON yard_zones`,
    );
    await q.query(`CREATE TRIGGER "TRG_audit_yard_zone_code_change" AFTER UPDATE OF code,is_active,purpose ON yard_zones
      FOR EACH ROW EXECUTE FUNCTION audit_yard_zone_code_change()`);
    await q.query(`INSERT INTO yard_slot_state_events(organization_id,yard_id,slot_id,event_type,occurred_at,state)
      SELECT y.organization_id,s.yard_id,s.id,'BASELINE',clock_timestamp(),to_jsonb(s)||jsonb_build_object(
        'zone_code',z.code,'zone_is_active',z.is_active,'zone_purpose',z.purpose)
      FROM yard_slots s JOIN yards y ON y.id=s.yard_id JOIN yard_zones z ON z.id=s.zone_id`);
    await q.query(
      `ALTER TABLE slot_daily_snapshots ADD COLUMN zone_is_active boolean, ADD COLUMN zone_purpose varchar`,
    );
    await q.query(
      `ALTER TABLE yard_daily_snapshots ADD COLUMN usable_capacity int, ADD COLUMN occupied_usable int`,
    );
    await q.query(`CREATE TABLE yard_inventory (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL REFERENCES organizations(id), yard_id uuid NOT NULL REFERENCES yards(id),
      order_vin_id uuid NOT NULL REFERENCES order_vins(id), vin varchar NOT NULL, entered_at timestamptz NOT NULL,
      closed_at timestamptz, position varchar NOT NULL CHECK (position IN ('PARKING','STAGING','LOADED','OFFSITE')),
      slot_id uuid REFERENCES yard_slots(id), last_slot_id uuid,
      CHECK ((closed_at IS NULL AND position IN ('PARKING','STAGING') AND slot_id IS NOT NULL)
        OR (closed_at IS NULL AND position='LOADED' AND slot_id IS NULL)
        OR (closed_at IS NOT NULL AND position='OFFSITE' AND slot_id IS NULL))
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_inventory_active_vin" ON yard_inventory(vin) WHERE closed_at IS NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_inventory_active_slot" ON yard_inventory(slot_id) WHERE closed_at IS NULL AND slot_id IS NOT NULL`,
    );
    await q.query(`CREATE TABLE inventory_movements (
      id bigserial PRIMARY KEY, inventory_id uuid NOT NULL REFERENCES yard_inventory(id),
      organization_id uuid NOT NULL, yard_id uuid NOT NULL, vin varchar NOT NULL,
      kind varchar NOT NULL CHECK(kind IN ('OPENING','INBOUND','MOVE','LOAD','UNLOAD','DEPARTURE','UNDO_INBOUND','ADJUST_IN','ADJUST_OUT')),
      delta int NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), operator_user_id uuid,
      reason text, reference text, waybill_id uuid, before_state jsonb, after_state jsonb NOT NULL,
      CHECK (delta = CASE WHEN kind IN ('OPENING','INBOUND','ADJUST_IN') THEN 1
        WHEN kind IN ('DEPARTURE','UNDO_INBOUND','ADJUST_OUT') THEN -1 ELSE 0 END)
    )`);
    await q.query(
      `CREATE INDEX inventory_movement_day ON inventory_movements(organization_id,yard_id,occurred_at)`,
    );
    await q.query(
      `CREATE INDEX inventory_movement_stay ON inventory_movements(inventory_id,id DESC)`,
    );
    await q.query(`INSERT INTO yard_inventory(organization_id,yard_id,order_vin_id,vin,entered_at,position,slot_id,last_slot_id)
      SELECT y.organization_id,s.yard_id,v.id,v.vin,v.arrived_at,'PARKING',s.id,s.id
      FROM yard_slots s JOIN yards y ON y.id=s.yard_id JOIN order_vins v ON v.slot_id=s.id AND v.vin=s.current_vin
      WHERE s.status='OCCUPIED'`);
    // Existing loaded vehicles are physically on their trailers, but still on site.
    await q.query(`UPDATE yard_inventory i SET position='LOADED',slot_id=NULL WHERE EXISTS (
      SELECT 1 FROM waybill_vins wv JOIN waybills w ON w.id=wv.waybill_id
      WHERE wv.vin=i.vin AND wv.loaded_at IS NOT NULL AND w.status='NOT_ARRIVED' AND w.origin_yard_id=i.yard_id)`);
    await q.query(`UPDATE yard_slots s SET status='VACANT',current_vin=NULL,assigned_at=NULL
      FROM yard_inventory i WHERE i.position='LOADED' AND s.id=i.last_slot_id`);
    await q.query(
      `UPDATE order_vins v SET slot_id=NULL FROM yard_inventory i WHERE i.order_vin_id=v.id AND i.position='LOADED'`,
    );
    await q.query(
      `UPDATE yard_slots s SET assigned_at=i.entered_at FROM yard_inventory i WHERE i.slot_id=s.id`,
    );
    await q.query(`INSERT INTO inventory_movements(inventory_id,organization_id,yard_id,vin,kind,delta,reason,after_state)
      SELECT i.id,i.organization_id,i.yard_id,i.vin,'OPENING',1,'库存流水启用基线；不重建历史进出库',
        jsonb_build_object('id',i.id,'organizationId',i.organization_id,'yardId',i.yard_id,'orderVinId',i.order_vin_id,
          'vin',i.vin,'enteredAt',i.entered_at,'closedAt',i.closed_at,'position',i.position,'slotId',i.slot_id,'lastSlotId',i.last_slot_id,
          'vehicle',jsonb_build_object('orderId',v.order_id,'slotId',v.slot_id,'arrivalStatus',v.arrival_status,'arrivedAt',v.arrived_at,
            'arrivalPhotoUrls',v.arrival_photo_urls,'vehicleCheckInfo',v.vehicle_check_info,'model',v.model,'color',v.color,'brand',v.brand,'vehicleType',v."vehicleType"))
      FROM yard_inventory i JOIN order_vins v ON v.id=i.order_vin_id`);
    await q.query(`CREATE FUNCTION protect_inventory_movement() RETURNS trigger AS $$ BEGIN
      RAISE EXCEPTION 'Inventory movements are immutable; record a correction instead'; END $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON inventory_movements
      FOR EACH ROW EXECUTE FUNCTION protect_inventory_movement()`);
    // Earlier completed snapshots remain immutable. New snapshots start from the next complete day.
    await q.query(
      `UPDATE organization_operating_policies SET snapshot_started_at=clock_timestamp()`,
    );
    await q.query(`ALTER TABLE inventory_daily_snapshots ALTER COLUMN slot_id DROP NOT NULL, ALTER COLUMN slot_code DROP NOT NULL,
      ADD COLUMN inventory_id uuid, ADD COLUMN position varchar`);
    await q.query(
      `ALTER TABLE vehicle_movement_daily_snapshots ADD COLUMN delta int, ADD COLUMN movement_kind varchar, ADD COLUMN ledger_id bigint`,
    );
    await q.query(
      `ALTER TABLE vehicle_movement_daily_snapshots ALTER COLUMN source_id DROP NOT NULL`,
    );
  }
  async down(): Promise<void> {
    throw new Error(
      'Inventory ledger migration is irreversible: restore the pre-migration backup to roll back.',
    );
  }
}
