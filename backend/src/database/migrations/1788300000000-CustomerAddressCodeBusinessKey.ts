import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerAddressCodeBusinessKey1788300000000 implements MigrationInterface {
  name = 'CustomerAddressCodeBusinessKey1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 已被历史运单引用的空编码记录不能安全删除或伪造 code；统一冻结，仅供追溯。
    await queryRunner.query(`
      UPDATE "customer_addresses"
      SET "isActive" = false
      WHERE NULLIF(BTRIM("code"), '') IS NULL
    `);
    // NOT VALID 只豁免上述已冻结历史行；所有新增或更新都必须有 code。
    await queryRunner.query(`
      ALTER TABLE "customer_addresses"
      ADD CONSTRAINT "chk_customer_addresses_code_required"
      CHECK (NULLIF(BTRIM("code"), '') IS NOT NULL) NOT VALID
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_customer_addresses_customer_code"
      ON "customer_addresses" ("customer_id", UPPER(BTRIM("code")))
      WHERE NULLIF(BTRIM("code"), '') IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_customer_addresses_customer_code"',
    );
    await queryRunner.query(`
      ALTER TABLE "customer_addresses"
      DROP CONSTRAINT IF EXISTS "chk_customer_addresses_code_required"
    `);
  }
}
