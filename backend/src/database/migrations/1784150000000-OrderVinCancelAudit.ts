import { MigrationInterface, QueryRunner } from 'typeorm';

// OrderVin 软取消审计：VIN 取消/整单取消都保留数据，不硬删；打审计标记以供追溯
export class OrderVinCancelAudit1784150000000 implements MigrationInterface {
  name = 'OrderVinCancelAudit1784150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD CONSTRAINT "fk_order_vins_cancelled_by_user" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP CONSTRAINT IF EXISTS "fk_order_vins_cancelled_by_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "cancelled_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "cancelled_at"`,
    );
  }
}
