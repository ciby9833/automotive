import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppReleases1788500000000 implements MigrationInterface {
  name = 'AppReleases1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "app_releases_platform_enum" AS ENUM ('ANDROID')
    `);
    await queryRunner.query(`
      CREATE TYPE "app_releases_status_enum" AS ENUM ('PUBLISHED', 'ARCHIVED')
    `);
    await queryRunner.query(`
      CREATE TABLE "app_releases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "platform" "app_releases_platform_enum" NOT NULL,
        "version_name" varchar(50) NOT NULL,
        "version_code" integer NOT NULL,
        "release_notes" text,
        "minimum_supported_version_code" integer,
        "force_update" boolean NOT NULL DEFAULT false,
        "status" "app_releases_status_enum" NOT NULL,
        "file_key" varchar NOT NULL,
        "original_filename" varchar NOT NULL,
        "mime_type" varchar NOT NULL,
        "file_size" bigint NOT NULL,
        "sha256" char(64) NOT NULL,
        "download_count" bigint NOT NULL DEFAULT 0,
        "published_at" timestamptz NOT NULL,
        "published_by" uuid,
        CONSTRAINT "PK_app_releases" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_app_releases_version_code" CHECK ("version_code" > 0),
        CONSTRAINT "CHK_app_releases_file_size" CHECK ("file_size" > 0),
        CONSTRAINT "FK_app_releases_published_by" FOREIGN KEY ("published_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_app_releases_platform_version_code"
      ON "app_releases" ("platform", "version_code")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_app_releases_latest"
      ON "app_releases" ("platform", "status", "published_at" DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_app_releases_one_published_per_platform"
      ON "app_releases" ("platform") WHERE "status" = 'PUBLISHED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_app_releases_one_published_per_platform"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_app_releases_latest"`);
    await queryRunner.query(
      `DROP INDEX "UQ_app_releases_platform_version_code"`,
    );
    await queryRunner.query(`DROP TABLE "app_releases"`);
    await queryRunner.query(`DROP TYPE "app_releases_status_enum"`);
    await queryRunner.query(`DROP TYPE "app_releases_platform_enum"`);
  }
}
