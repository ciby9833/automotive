import { MigrationInterface, QueryRunner } from 'typeorm';

// operation_logs 升级为 VIN 全生命周期节点表：
// 加 event_at (业务发生时间，与 created_at 分开) + yard_id / slot_id / waybill_id 结构化关联
// + attachment_urls 顶层照片数组，前端不用再从 payload 里挖 photoKeys
export class OperationLogTimelineFields1785000000000
  implements MigrationInterface
{
  name = 'OperationLogTimelineFields1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD COLUMN IF NOT EXISTS "event_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD COLUMN IF NOT EXISTS "yard_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD COLUMN IF NOT EXISTS "slot_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD COLUMN IF NOT EXISTS "waybill_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD COLUMN IF NOT EXISTS "attachment_urls" text[]`,
    );

    // 老数据 event_at 兜底 = 创建时间，保证按 event_at 排序时旧行也有值。
    // 历史遗留：早期 (synchronize=true) 生成的表列名是 "createdAt"（camelCase），
    // 后来的 migration 用 "created_at"（snake_case）。同一个 codebase 会遇到两种。
    // 用 information_schema 探测再动态回填，两种命名都兼容。
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'operation_logs'
            AND column_name = 'created_at'
        ) THEN
          UPDATE "operation_logs" SET "event_at" = "created_at" WHERE "event_at" IS NULL;
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'operation_logs'
            AND column_name = 'createdAt'
        ) THEN
          UPDATE "operation_logs" SET "event_at" = "createdAt" WHERE "event_at" IS NULL;
        END IF;
      END $$;
    `);

    // FK 都设 SET NULL：仓/库位/运单实体被删时，日志不阻塞
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD CONSTRAINT "fk_operation_logs_yard"
        FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD CONSTRAINT "fk_operation_logs_slot"
        FOREIGN KEY ("slot_id") REFERENCES "yard_slots"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" ADD CONSTRAINT "fk_operation_logs_waybill"
        FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE SET NULL`,
    );

    // 轨迹查询主索引：按 vin + event_at DESC 拿倒序时间线
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_operation_logs_vin_event_at"
        ON "operation_logs"("vin", "event_at" DESC)`,
    );
    // 库位历史报表：按 slot_id 查该位停过哪些车
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_operation_logs_slot_id"
        ON "operation_logs"("slot_id")`,
    );
    // waybill 详情页事件流
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_operation_logs_waybill_id"
        ON "operation_logs"("waybill_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_operation_logs_waybill_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_operation_logs_slot_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_operation_logs_vin_event_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP CONSTRAINT IF EXISTS "fk_operation_logs_waybill"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP CONSTRAINT IF EXISTS "fk_operation_logs_slot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP CONSTRAINT IF EXISTS "fk_operation_logs_yard"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP COLUMN IF EXISTS "attachment_urls"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP COLUMN IF EXISTS "waybill_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP COLUMN IF EXISTS "slot_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP COLUMN IF EXISTS "yard_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "operation_logs" DROP COLUMN IF EXISTS "event_at"`,
    );
  }
}
