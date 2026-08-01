import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartnerOperationalStatus1788100000000 implements MigrationInterface {
  name = 'PartnerOperationalStatus1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."partner_status_enum"
      AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE')
    `);
    await queryRunner.query(`
      ALTER TABLE "carriers"
      DROP COLUMN "isActive",
      ADD COLUMN "status" "public"."partner_status_enum" NOT NULL DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN "isActive",
      ADD COLUMN "status" "public"."partner_status_enum" NOT NULL DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`CREATE INDEX "idx_carriers_status" ON "carriers" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_customers_status" ON "customers" ("status")`);
  }

  public async down(): Promise<void> {
    throw new Error('PartnerOperationalStatus is irreversible in the development reset flow');
  }
}
