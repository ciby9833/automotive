import { MigrationInterface, QueryRunner } from 'typeorm';

// 历史包袱：87000-OrganizationDailyOperationalSnapshots 后来在 CREATE TABLE 里
// 已经带了 order_vin_slot_id 列，dev 库因先跑本 migration 才没冲突；
// 全新库同批跑 87000+87400 时会因 "column already exists" 崩。
// 加 IF NOT EXISTS 让本 migration 幂等：全新库跳过、老 dev 库仍生效。
export class InventorySnapshotReconciliation1787400000000 implements MigrationInterface {
  name = 'InventorySnapshotReconciliation1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_daily_snapshots
      ADD COLUMN IF NOT EXISTS order_vin_slot_id uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_daily_snapshots
      DROP COLUMN IF EXISTS order_vin_slot_id
    `);
  }
}
