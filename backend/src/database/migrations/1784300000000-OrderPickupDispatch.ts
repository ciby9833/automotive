import { MigrationInterface, QueryRunner } from 'typeorm';

// 入库订单提货分派 + 生命周期字段
// 支撑「按订单维度提货」：HQ 分派承运商 → 承运商任务池 → 司机订单内扫码
export class OrderPickupDispatch1784300000000 implements MigrationInterface {
  name = 'OrderPickupDispatch1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."orders_pickup_status_enum" AS ENUM ('PENDING','IN_PROGRESS','COMPLETED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_carrier_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_driver_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "planned_pickup_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_status" "public"."orders_pickup_status_enum" NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_started_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_completed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_pickup_carrier" FOREIGN KEY ("pickup_carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_pickup_driver_user" FOREIGN KEY ("pickup_driver_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    // 承运商任务池按 pickup_carrier_id + pickup_status 常查
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_orders_pickup_carrier_status" ON "orders"("pickup_carrier_id","pickup_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_orders_pickup_carrier_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "fk_orders_pickup_driver_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "fk_orders_pickup_carrier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "pickup_completed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "pickup_started_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "pickup_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "planned_pickup_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "pickup_driver_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "pickup_carrier_id"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."orders_pickup_status_enum"`,
    );
  }
}
