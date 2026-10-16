import { MigrationInterface, QueryRunner } from 'typeorm';

/** 运输明细 / 导出要按每台车取“分配物流商、派车”等动作时间，按 line_id + action 建索引 */
export class TransportEventLineIndex1790900000000 implements MigrationInterface {
  name = 'TransportEventLineIndex1790900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX IF NOT EXISTS transport_events_line ON transport_events(line_id, action, created_at) WHERE line_id IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS transport_events_line`);
  }
}
