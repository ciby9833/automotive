import { MigrationInterface, QueryRunner } from 'typeorm';

// 客户地址簿加 3 列，对齐 BYD 门店 Excel 结构：dealer_group / code / region
// 这三个字段都可空 (老数据兼容)，`code` 后续可能作为去重键但不建索引 (客户小规模)
export class CustomerAddressExtraFields1783900000000
  implements MigrationInterface
{
  name = 'CustomerAddressExtraFields1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "dealer_group" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "region" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP COLUMN IF EXISTS "region"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP COLUMN IF EXISTS "code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP COLUMN IF EXISTS "dealer_group"`,
    );
  }
}
