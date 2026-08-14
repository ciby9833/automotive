import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppReleaseInvalidationAndMetadata1788600000000 implements MigrationInterface {
  name = 'AppReleaseInvalidationAndMetadata1788600000000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "app_releases_status_enum" ADD VALUE IF NOT EXISTS 'INVALIDATED'
    `);
    await queryRunner.query(`
      ALTER TABLE "app_releases"
        ADD COLUMN "package_name" varchar,
        ADD COLUMN "min_sdk_version" integer,
        ADD COLUMN "target_sdk_version" integer,
        ADD COLUMN "invalidated_at" timestamptz,
        ADD COLUMN "invalidated_by" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "app_releases"
      ADD CONSTRAINT "FK_app_releases_invalidated_by"
      FOREIGN KEY ("invalidated_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_releases" DROP CONSTRAINT "FK_app_releases_invalidated_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "app_releases"
        DROP COLUMN "invalidated_by",
        DROP COLUMN "invalidated_at",
        DROP COLUMN "target_sdk_version",
        DROP COLUMN "min_sdk_version",
        DROP COLUMN "package_name"
    `);
    // PostgreSQL 不支持安全地直接删除 enum value；回滚保留 INVALIDATED 枚举值。
  }
}
