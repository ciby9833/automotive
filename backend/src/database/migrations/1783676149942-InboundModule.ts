import { MigrationInterface, QueryRunner } from "typeorm";

export class InboundModule1783676149942 implements MigrationInterface {
    name = 'InboundModule1783676149942'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Order: 客户单号/目的仓/预计到货日
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_order_no" character varying`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_yard_id" uuid`);
        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expected_arrival_date" date`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_destination_yard" FOREIGN KEY ("destination_yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        // InboundBatch 新表
        await queryRunner.query(`CREATE TABLE "inbound_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "yard_id" uuid NOT NULL, "batch_code" character varying NOT NULL, "arrived_date" date NOT NULL, "notes" text, "created_by_user_id" uuid, CONSTRAINT "UQ_4e77b64caa7cba5ec3b4867b07a" UNIQUE ("batch_code"), CONSTRAINT "PK_1e85f289066c29c8a6f275864b3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5c72577737235381212c7b08c0" ON "inbound_batches" ("organization_id") `);
        await queryRunner.query(`ALTER TABLE "carriers" ADD "short_name" character varying`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "brand" character varying`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "motor_no" character varying`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "pickup_carrier_id" uuid`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "pickup_driver_user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "picked_up_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "pickup_location" character varying`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "pickup_photo_urls" text array`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "pickup_remark" text`);
        await queryRunner.query(`CREATE TYPE "public"."order_vins_arrival_status_enum" AS ENUM('EXPECTED', 'ARRIVED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "arrival_status" "public"."order_vins_arrival_status_enum" NOT NULL DEFAULT 'EXPECTED'`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "arrived_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "arrived_by_user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "slot_id" uuid`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD "inbound_batch_id" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_61e52789060d4c5ea3ee2f003a" ON "order_vins" ("arrival_status") `);
        await queryRunner.query(`ALTER TABLE "inbound_batches" ADD CONSTRAINT "FK_5c72577737235381212c7b08c06" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inbound_batches" ADD CONSTRAINT "FK_998b889da3e3087f92c846fa2c1" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inbound_batches" ADD CONSTRAINT "FK_bb09009ce25d7e0293805f232ea" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD CONSTRAINT "FK_e1af3f344e2306c8e1eacbf5477" FOREIGN KEY ("pickup_carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD CONSTRAINT "FK_f6c8eae0f0b215b02b8dbfdb267" FOREIGN KEY ("pickup_driver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD CONSTRAINT "FK_50ffe804e9e181e22e952c40eca" FOREIGN KEY ("arrived_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD CONSTRAINT "FK_fda7424e124a3d67dd7e3d1d201" FOREIGN KEY ("slot_id") REFERENCES "yard_slots"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_vins" ADD CONSTRAINT "FK_44a8978a8c6bce9d72f7d92ec56" FOREIGN KEY ("inbound_batch_id") REFERENCES "inbound_batches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_destination_yard"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "expected_arrival_date"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "destination_yard_id"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_order_no"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP CONSTRAINT "FK_44a8978a8c6bce9d72f7d92ec56"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP CONSTRAINT "FK_fda7424e124a3d67dd7e3d1d201"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP CONSTRAINT "FK_50ffe804e9e181e22e952c40eca"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP CONSTRAINT "FK_f6c8eae0f0b215b02b8dbfdb267"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP CONSTRAINT "FK_e1af3f344e2306c8e1eacbf5477"`);
        await queryRunner.query(`ALTER TABLE "inbound_batches" DROP CONSTRAINT "FK_bb09009ce25d7e0293805f232ea"`);
        await queryRunner.query(`ALTER TABLE "inbound_batches" DROP CONSTRAINT "FK_998b889da3e3087f92c846fa2c1"`);
        await queryRunner.query(`ALTER TABLE "inbound_batches" DROP CONSTRAINT "FK_5c72577737235381212c7b08c06"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_61e52789060d4c5ea3ee2f003a"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "inbound_batch_id"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "slot_id"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "arrived_by_user_id"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "arrived_at"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "arrival_status"`);
        await queryRunner.query(`DROP TYPE "public"."order_vins_arrival_status_enum"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "pickup_remark"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "pickup_photo_urls"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "pickup_location"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "picked_up_at"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "pickup_driver_user_id"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "pickup_carrier_id"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "motor_no"`);
        await queryRunner.query(`ALTER TABLE "order_vins" DROP COLUMN "brand"`);
        await queryRunner.query(`ALTER TABLE "carriers" DROP COLUMN "short_name"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5c72577737235381212c7b08c0"`);
        await queryRunner.query(`DROP TABLE "inbound_batches"`);
    }

}
