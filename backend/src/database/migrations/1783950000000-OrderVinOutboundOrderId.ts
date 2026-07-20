import { MigrationInterface, QueryRunner } from 'typeorm';

// 出库单硬关联：OrderVin.outbound_order_id → orders(id)
// 之前用 customerOrderNo 软关联，脆弱不可靠；改成 FK
export class OrderVinOutboundOrderId1783950000000
  implements MigrationInterface
{
  name = 'OrderVinOutboundOrderId1783950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD COLUMN IF NOT EXISTS "outbound_order_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD CONSTRAINT "FK_order_vins_outbound_order" FOREIGN KEY ("outbound_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_vins_outbound_order_id" ON "order_vins" ("outbound_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_order_vins_outbound_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP CONSTRAINT IF EXISTS "FK_order_vins_outbound_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP COLUMN IF EXISTS "outbound_order_id"`,
    );
  }
}
