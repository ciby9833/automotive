import { MigrationInterface, QueryRunner } from 'typeorm';

export class SnapshotBuildMutationGuard1787200000000 implements MigrationInterface {
  name = 'SnapshotBuildMutationGuard1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_daily_snapshot_mutation()
      RETURNS trigger AS $$
      DECLARE run_status daily_snapshot_run_status_enum;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          SELECT status INTO run_status
          FROM daily_snapshot_runs
          WHERE id = NEW.snapshot_run_id;
          IF run_status = 'STARTED' THEN
            RETURN NEW;
          END IF;
        END IF;
        RAISE EXCEPTION '已完成的每日快照是不可变事实，不允许更新或删除';
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_daily_snapshot_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '每日快照是不可变事实，不允许更新或删除';
      END;
      $$ LANGUAGE plpgsql
    `);
  }
}
