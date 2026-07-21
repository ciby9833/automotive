import { MigrationInterface, QueryRunner } from 'typeorm';

// 通用业务审计表：与既有 waybill_status_logs 分工承接非扫码类事件
export class OperationLog1784200000000 implements MigrationInterface {
  name = 'OperationLog1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."operation_logs_operation_type_enum" AS ENUM (
          'INBOUND_ORDER_IMPORT','INBOUND_ORDER_REACTIVATE','INBOUND_ORDER_CANCEL',
          'INBOUND_VIN_EDIT','INBOUND_VIN_CANCEL',
          'PICKUP_SCAN','INBOUND_SCAN','INBOUND_UNDO',
          'YARD_MOVE',
          'OUTBOUND_ORDER_IMPORT','OUTBOUND_ORDER_CANCEL',
          'WAYBILL_PLAN','WAYBILL_CANCEL'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "operation_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "operation_type" "public"."operation_logs_operation_type_enum" NOT NULL,
        "order_id" uuid,
        "vin" varchar,
        "payload" jsonb,
        "operator_user_id" uuid,
        CONSTRAINT "fk_operation_logs_operator" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_operation_logs_vin" ON "operation_logs"("vin")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_operation_logs_order_id" ON "operation_logs"("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_operation_logs_created_at" ON "operation_logs"("createdAt" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "operation_logs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."operation_logs_operation_type_enum"`,
    );
  }
}
