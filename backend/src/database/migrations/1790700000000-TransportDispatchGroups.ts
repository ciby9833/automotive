import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 10-14 调度提速：导入时按组（CC1 / CC2 …）归车，一组就是一趟车，可以按组一次派车。
 * 组号只在同一批内有效（group_batch_id：一次 Excel 导入或一次“设为组”），每天都可以写 CC1 而不会串到前一天。
 */
export class TransportDispatchGroups1790700000000 implements MigrationInterface {
  name = 'TransportDispatchGroups1790700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE transport_lines ADD COLUMN dispatch_group varchar(40)`);
    await q.query(`ALTER TABLE transport_lines ADD COLUMN group_batch_id uuid`);
    await q.query(`ALTER TABLE transport_lines ADD CONSTRAINT transport_lines_group_check
      CHECK ((dispatch_group IS NULL) = (group_batch_id IS NULL))`);
    await q.query(
      `CREATE INDEX transport_lines_group ON transport_lines(organization_id, group_batch_id, dispatch_group) WHERE group_batch_id IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS transport_lines_group`);
    await q.query(`ALTER TABLE transport_lines DROP CONSTRAINT transport_lines_group_check`);
    await q.query(`ALTER TABLE transport_lines DROP COLUMN group_batch_id`);
    await q.query(`ALTER TABLE transport_lines DROP COLUMN dispatch_group`);
  }
}
