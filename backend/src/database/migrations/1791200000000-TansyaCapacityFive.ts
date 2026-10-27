import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 10-27：TANSYA 默认载量由 4 改为 5（代码里的 DEFAULT_CAPACITY 已改）。
 * 趟次在建立时把载量存下来了，这里只把“还没完成、载量来自默认值”的 TANSYA 趟次同步成 5：
 * 拖车资料单独填了载量的、已完成 / 已取消的历史趟次都不动。
 */
export class TansyaCapacityFive1791200000000 implements MigrationInterface {
  name = 'TansyaCapacityFive1791200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE transport_trips t SET capacity = 5
      WHERE t.tow_type = 'TANSYA' AND t.capacity = 4 AND t.status IN ('PLANNED','LOADING','IN_TRANSIT')
        AND (t.vehicle_id IS NULL
             OR EXISTS (SELECT 1 FROM carrier_vehicles v WHERE v.id = t.vehicle_id AND v.capacity IS NULL))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE transport_trips t SET capacity = 4
      WHERE t.tow_type = 'TANSYA' AND t.capacity = 5 AND t.status IN ('PLANNED','LOADING','IN_TRANSIT')
        AND (t.vehicle_id IS NULL
             OR EXISTS (SELECT 1 FROM carrier_vehicles v WHERE v.id = t.vehicle_id AND v.capacity IS NULL))`);
  }
}
