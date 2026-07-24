import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderVinPickupGps1784320000000 implements MigrationInterface {
  name = 'OrderVinPickupGps1784320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_vins"
      ADD COLUMN IF NOT EXISTS "pickup_latitude" double precision,
      ADD COLUMN IF NOT EXISTS "pickup_longitude" double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_vins"
      DROP COLUMN IF EXISTS "pickup_longitude",
      DROP COLUMN IF EXISTS "pickup_latitude"
    `);
  }
}
