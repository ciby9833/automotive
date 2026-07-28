import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventorySnapshotReconciliation1787400000000 implements MigrationInterface {
  name = 'InventorySnapshotReconciliation1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_daily_snapshots
      ADD COLUMN order_vin_slot_id uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_daily_snapshots
      DROP COLUMN order_vin_slot_id
    `);
  }
}
