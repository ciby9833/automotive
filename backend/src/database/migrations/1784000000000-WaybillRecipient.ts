import { MigrationInterface, QueryRunner } from 'typeorm';

// Waybill 加本次运单收件人 (与门店固定联系人分开：可能是店长/仓管/临时接货人)
export class WaybillRecipient1784000000000 implements MigrationInterface {
  name = 'WaybillRecipient1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "recipient_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD COLUMN IF NOT EXISTS "recipient_phone" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP COLUMN IF EXISTS "recipient_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP COLUMN IF EXISTS "recipient_name"`,
    );
  }
}
