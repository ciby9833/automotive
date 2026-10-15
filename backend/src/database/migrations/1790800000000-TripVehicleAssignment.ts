import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 10-14 派车拆成两步：调度按组确认后先生成只有物流商的趟次（待指派车辆），
 * 司机和拖车之后由 J&T 或物流商业务员指派。没指派不能提货（“实际运输车辆必须记录承运商及拖车”）。
 */
export class TripVehicleAssignment1790800000000 implements MigrationInterface {
  name = 'TripVehicleAssignment1790800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE transport_trips ALTER COLUMN driver_id DROP NOT NULL`);
    await q.query(`ALTER TABLE transport_trips ALTER COLUMN vehicle_id DROP NOT NULL`);
    await q.query(`ALTER TABLE transport_trips ADD CONSTRAINT transport_trips_assignment_check
      CHECK ((driver_id IS NULL) = (vehicle_id IS NULL))`);
    await q.query(`ALTER TABLE transport_trips ADD CONSTRAINT transport_trips_assigned_before_pickup
      CHECK (status IN ('PLANNED','CANCELLED') OR vehicle_id IS NOT NULL)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE transport_trips DROP CONSTRAINT transport_trips_assigned_before_pickup`);
    await q.query(`ALTER TABLE transport_trips DROP CONSTRAINT transport_trips_assignment_check`);
    await q.query(`ALTER TABLE transport_trips ALTER COLUMN vehicle_id SET NOT NULL`);
    await q.query(`ALTER TABLE transport_trips ALTER COLUMN driver_id SET NOT NULL`);
  }
}
