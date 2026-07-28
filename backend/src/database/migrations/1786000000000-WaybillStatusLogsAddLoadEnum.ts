import { MigrationInterface, QueryRunner } from 'typeorm';

// 补齐 waybill_status_logs_action_enum：源码 ScanAction 里有 DELIVERY_LOAD /
// DELIVERY_LOAD_UNDO，但 InitialSchema 只建了 5 个值，之后没有 migration 补。
// dev 库有可能是 synchronize=true 时代 TypeORM 自动加过，prod 库始终缺 → 装车
// (loadVin) 时事务外 appendLog 触发 enum 校验错，报 500。
export class WaybillStatusLogsAddLoadEnum1786000000000
  implements MigrationInterface
{
  name = 'WaybillStatusLogsAddLoadEnum1786000000000';

  // ALTER TYPE ADD VALUE 不能在事务里跑
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."waybill_status_logs_action_enum" ADD VALUE IF NOT EXISTS 'DELIVERY_LOAD'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."waybill_status_logs_action_enum" ADD VALUE IF NOT EXISTS 'DELIVERY_LOAD_UNDO'`,
    );
  }

  public async down(): Promise<void> {
    // enum 值一旦被数据引用无法删；不提供 down
  }
}
