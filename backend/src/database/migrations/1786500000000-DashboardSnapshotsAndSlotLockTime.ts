import { MigrationInterface, QueryRunner } from 'typeorm';

export class DashboardSnapshotsAndSlotLockTime1786500000000 implements MigrationInterface {
  name = 'DashboardSnapshotsAndSlotLockTime1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "yard_slots"
      ADD COLUMN "locked_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      UPDATE "yard_slots"
      SET "locked_at" = "updated_at"
      WHERE "isLocked" = true
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_yard_slot_locked_at()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."isLocked" = true
          AND (OLD."isLocked" = false OR NEW."locked_at" IS NULL) THEN
          NEW."locked_at" = NOW();
        ELSIF NEW."isLocked" = false THEN
          NEW."locked_at" = NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_yard_slot_locked_at"
      BEFORE UPDATE ON "yard_slots"
      FOR EACH ROW EXECUTE FUNCTION set_yard_slot_locked_at()
    `);
    await queryRunner.query(`
      CREATE TABLE "dashboard_daily_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "snapshot_date" date NOT NULL,
        "organization_id" uuid NOT NULL,
        "yard_id" uuid NOT NULL,
        "yard_active" boolean NOT NULL DEFAULT true,
        "total_slots" integer NOT NULL,
        "used_slots" integer NOT NULL,
        "vehicles_on_site" integer NOT NULL,
        CONSTRAINT "PK_dashboard_daily_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dashboard_snapshot_date_yard"
          UNIQUE ("snapshot_date", "yard_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_dashboard_snapshot_org_date"
      ON "dashboard_daily_snapshots" ("organization_id", "snapshot_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dashboard_snapshot_org_date"`,
    );
    await queryRunner.query(`DROP TABLE "dashboard_daily_snapshots"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_yard_slot_locked_at" ON "yard_slots"`,
    );
    await queryRunner.query(`DROP FUNCTION set_yard_slot_locked_at`);
    await queryRunner.query(`ALTER TABLE "yard_slots" DROP COLUMN "locked_at"`);
  }
}
