import { MigrationInterface, QueryRunner } from 'typeorm';

// Order 软取消支持：status(ACTIVE|CANCELLED) + 取消人/取消时间
// 语义：入库订单删除改为软取消，保留订单壳，允许后续重新导入 VIN 继续使用
export class OrderSoftCancel1784100000000 implements MigrationInterface {
  name = 'OrderSoftCancel1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."orders_status_enum" AS ENUM ('ACTIVE', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "status" "public"."orders_status_enum" NOT NULL DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_cancelled_by_user" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "fk_orders_cancelled_by_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancelled_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancelled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."orders_status_enum"`);
  }
}
