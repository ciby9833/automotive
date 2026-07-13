import { MigrationInterface, QueryRunner } from 'typeorm';

// 入库扫描原本丢弃了业务员上传的照片/车检/备注：DTO 收到但服务没写入、实体也没列。
// 这次一次性补齐三列，命名与 pickup_* 对称，jsonb 保留 vehicle_check_info 扩展性
export class AddInboundEvidence1783720000000 implements MigrationInterface {
  name = 'AddInboundEvidence1783720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "arrival_photo_urls" text array`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "vehicle_check_info" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "arrival_remark" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "arrival_remark"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "vehicle_check_info"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "arrival_photo_urls"`,
    );
  }
}
