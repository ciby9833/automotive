import { MigrationInterface, QueryRunner } from 'typeorm';

// 出库模块：OrderVin 新增每 VIN 的派送目的地 + 拖车类型 + 分组编号
// (对称 pickup 侧的 pickup_* 字段：一台车带自己的出库属性，不占 Order 头)
export class OutboundModule1783810000000 implements MigrationInterface {
  name = 'OutboundModule1783810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // enum vehicle_tow_type 已由 waybill.tow_type 提前创建；此处直接引用即可
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "dealer_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "dealer_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "tow_type" "public"."waybills_towtype_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "group_code" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "group_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "tow_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "dealer_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "dealer_code"`,
    );
  }
}
