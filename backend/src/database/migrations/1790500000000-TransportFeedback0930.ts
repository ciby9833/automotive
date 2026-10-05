import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 09.30 业务反馈：
 * 1. 客户新增编号，Excel 导入按编号（优先）或名称匹配，一个文件可以导多个客户、多个订单号。
 * 2. 取消“一辆拖车/一个司机同时只能有一个未完成趟次”的硬约束：允许提前排多趟，
 *    改为装车时校验——同一辆拖车还有“已装车未签收”的车时，不能给别的趟次装车（见 transport-trips.service）。
 */
export class TransportFeedback09301790500000000 implements MigrationInterface {
  name = 'TransportFeedback09301790500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE customers ADD COLUMN code varchar`);
    await q.query(
      `CREATE UNIQUE INDEX customers_org_code ON customers(organization_id, lower(btrim(code))) WHERE code IS NOT NULL AND btrim(code) <> ''`,
    );
    await q.query(`DROP INDEX IF EXISTS transport_trips_active_vehicle`);
    await q.query(`DROP INDEX IF EXISTS transport_trips_active_driver`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`CREATE UNIQUE INDEX transport_trips_active_vehicle ON transport_trips(vehicle_id)
      WHERE status IN ('PLANNED','LOADING','IN_TRANSIT')`);
    await q.query(`CREATE UNIQUE INDEX transport_trips_active_driver ON transport_trips(driver_id)
      WHERE status IN ('PLANNED','LOADING','IN_TRANSIT')`);
    await q.query(`DROP INDEX IF EXISTS customers_org_code`);
    await q.query(`ALTER TABLE customers DROP COLUMN code`);
  }
}
