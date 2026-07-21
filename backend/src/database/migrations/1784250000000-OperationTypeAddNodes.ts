import { MigrationInterface, QueryRunner } from 'typeorm';

// 追加 OperationType 枚举值：异常入库 + 运单指派司机车辆
// Postgres 枚举添加值不能包在事务里 (isTransactionRequired = false)
export class OperationTypeAddNodes1784250000000 implements MigrationInterface {
  name = 'OperationTypeAddNodes1784250000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."operation_logs_operation_type_enum" ADD VALUE IF NOT EXISTS 'INBOUND_UNEXPECTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."operation_logs_operation_type_enum" ADD VALUE IF NOT EXISTS 'WAYBILL_ASSIGN'`,
    );
  }

  // Postgres 不支持从 enum 移除值，回滚只保留占位
  public async down(): Promise<void> {
    // no-op
  }
}
