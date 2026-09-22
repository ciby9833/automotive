import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperationalUpdates1790400000000 implements MigrationInterface {
  name = 'OperationalUpdates1790400000000';

  async up(q: QueryRunner) {
    // NOTIFY is delivered after COMMIT and folded for identical payloads in one transaction.
    // Reuse the existing fact/history tables; no second inventory ledger or per-user polling table.
    await q.query(`CREATE FUNCTION notify_operational_change() RETURNS trigger AS $$
      DECLARE r jsonb; org uuid; yard uuid;
      BEGIN
        IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
        r := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        org := (r->>'organization_id')::uuid;
        yard := (r->>'yard_id')::uuid;
        IF TG_TABLE_NAME='yard_zones' THEN
          SELECT organization_id INTO org FROM yards WHERE id=yard;
        ELSIF TG_TABLE_NAME='organizations' THEN org := (r->>'id')::uuid;
        END IF;
        IF org IS NOT NULL THEN
          PERFORM pg_notify('alms_operational_change',json_build_object(
            'organizationId',org,'yardId',yard,'kind',TG_ARGV[0])::text);
        END IF;
        RETURN COALESCE(NEW,OLD);
      END $$ LANGUAGE plpgsql`);
    for (const table of [
      'yard_slot_state_events',
      'yard_state_events',
      'inventory_movements',
    ]) {
      await q.query(`CREATE TRIGGER notify_operational_change AFTER INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION notify_operational_change('yard')`);
    }
    for (const [table, kind] of [
      ['yard_zones', 'yard'],
      ['organization_operating_policies', 'policy'],
      ['organizations', 'policy'],
      ['orders', 'dashboard'],
      ['daily_snapshot_runs', 'dashboard'],
    ]) {
      await q.query(`CREATE TRIGGER notify_operational_change AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION notify_operational_change('${kind}')`);
    }
    await q.query(`CREATE TRIGGER notify_operational_change AFTER INSERT ON order_vin_state_events
      FOR EACH ROW EXECUTE FUNCTION notify_operational_change('dashboard')`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_yard_inventory_active_read ON yard_inventory(yard_id,position) WHERE closed_at IS NULL`,
    );
  }

  async down(q: QueryRunner) {
    for (const table of [
      'yard_slot_state_events',
      'yard_state_events',
      'inventory_movements',
      'yard_zones',
      'organization_operating_policies',
      'organizations',
      'orders',
      'daily_snapshot_runs',
      'order_vin_state_events',
    ]) {
      await q.query(`DROP TRIGGER notify_operational_change ON ${table}`);
    }
    await q.query('DROP FUNCTION notify_operational_change()');
    await q.query('DROP INDEX idx_yard_inventory_active_read');
  }
}
