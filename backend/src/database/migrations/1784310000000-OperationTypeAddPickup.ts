import { MigrationInterface, QueryRunner } from 'typeorm';

// 追加 OperationType 枚举值：提货分派 + 提货完成
export class OperationTypeAddPickup1784310000000 implements MigrationInterface {
  name = 'OperationTypeAddPickup1784310000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."operation_logs_operation_type_enum" ADD VALUE IF NOT EXISTS 'PICKUP_ASSIGN'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."operation_logs_operation_type_enum" ADD VALUE IF NOT EXISTS 'PICKUP_COMPLETE'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres 不支持从 enum 移除值
  }
}
