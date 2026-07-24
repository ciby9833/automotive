import { MigrationInterface, QueryRunner } from 'typeorm';

// 追加 OperationType 枚举值：承运商账号管理事件
export class OperationTypeAddCarrierUser1784400000000
  implements MigrationInterface
{
  name = 'OperationTypeAddCarrierUser1784400000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const v of [
      'CARRIER_USER_CREATE',
      'CARRIER_USER_UPDATE',
      'CARRIER_USER_DEACTIVATE',
      'CARRIER_USER_REACTIVATE',
      'CARRIER_USER_RESET_PWD',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."operation_logs_operation_type_enum" ADD VALUE IF NOT EXISTS '${v}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Postgres 不支持从 enum 移除值
  }
}
