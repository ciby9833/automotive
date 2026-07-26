import { MigrationInterface, QueryRunner } from 'typeorm';

// 追加 OperationType 枚举值：承运商司机/车辆花名册的增删改
export class OperationTypeAddCarrierFleet1784500000000
  implements MigrationInterface
{
  name = 'OperationTypeAddCarrierFleet1784500000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const v of [
      'CARRIER_DRIVER_CREATE',
      'CARRIER_DRIVER_UPDATE',
      'CARRIER_DRIVER_DELETE',
      'CARRIER_VEHICLE_CREATE',
      'CARRIER_VEHICLE_UPDATE',
      'CARRIER_VEHICLE_DELETE',
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
