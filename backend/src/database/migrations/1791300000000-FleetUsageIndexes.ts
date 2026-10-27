import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 车辆 / 司机被引用处的索引：删除前的使用检查、纯运输装车时“拖车是否还有未签收的车”都按这些列查。
 * 用 CONCURRENTLY 建，生产上不锁写；所以本迁移不放在事务里。
 */
export class FleetUsageIndexes1791300000000 implements MigrationInterface {
  name = 'FleetUsageIndexes1791300000000';
  transaction = false as const;

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS transport_trips_vehicle ON transport_trips(vehicle_id)`);
    await q.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS transport_trips_driver ON transport_trips(driver_id)`);
    await q.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS waybills_vehicle ON waybills(vehicle_id)`);
    await q.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS waybills_driver ON waybills(driver_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const name of ['transport_trips_vehicle', 'transport_trips_driver', 'waybills_vehicle', 'waybills_driver'])
      await q.query(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
  }
}
