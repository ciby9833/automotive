import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveLegacyDashboardSnapshots1787300000000 implements MigrationInterface {
  name = 'ArchiveLegacyDashboardSnapshots1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dashboard_daily_snapshots
      RENAME TO dashboard_daily_snapshots_legacy
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dashboard_daily_snapshots_legacy
      RENAME TO dashboard_daily_snapshots
    `);
  }
}
