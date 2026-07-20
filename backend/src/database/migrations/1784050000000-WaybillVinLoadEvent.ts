import { MigrationInterface, QueryRunner } from 'typeorm';

// 装车事件：per-VIN loadedAt + 单台车装车照
// 支持真实 FVL 两阶段流程 (逐台扫码装车 → 全部装完统一启运出闸)
export class WaybillVinLoadEvent1784050000000 implements MigrationInterface {
  name = 'WaybillVinLoadEvent1784050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waybill_vins" ADD COLUMN IF NOT EXISTS "loaded_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_vins" ADD COLUMN IF NOT EXISTS "load_photo_keys" text[] NOT NULL DEFAULT '{}'::text[]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waybill_vins" DROP COLUMN IF EXISTS "load_photo_keys"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_vins" DROP COLUMN IF EXISTS "loaded_at"`,
    );
  }
}
