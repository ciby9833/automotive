import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1783492037400 implements MigrationInterface {
  name = 'InitialSchema1783492037400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_defaultcurrency_enum" AS ENUM('IDR', 'MYR', 'THB', 'VND', 'PHP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "name" character varying NOT NULL, "defaultCurrency" "public"."organizations_defaultcurrency_enum" NOT NULL, "parent_id" uuid, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_7e27c3b62c681fbe3e2322535f2" UNIQUE ("code"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f3a7c9411eaa5f9cbc5363de33" ON "organizations" ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."yard_slots_status_enum" AS ENUM('VACANT', 'OCCUPIED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "yard_slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "yard_id" uuid NOT NULL, "code" character varying NOT NULL, "row" character varying, "slotNo" character varying, "status" "public"."yard_slots_status_enum" NOT NULL DEFAULT 'VACANT', "currentVin" character varying, CONSTRAINT "PK_906deba036d766aa689f557ef81" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_be019a36a32bf9ca5350b94086" ON "yard_slots" ("yard_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "yards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "address" character varying, "location" geometry(Point,4326), "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_cd431c4029df1cfa2e7a737ce08" UNIQUE ("code"), CONSTRAINT "PK_3aa7dacb4c4fb065b1e2f8dfb5a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_78807529b99a5a8176054c7234" ON "yards" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "dealerName" character varying NOT NULL, "address" character varying NOT NULL, "contactName" character varying, "contactPhone" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_336bda7b0a0cd04241f719fc834" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying NOT NULL, "contactName" character varying, "contactPhone" character varying, "email" character varying, "quotationNote" text, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d2fc0e42b07d01fafc3fbb2bee" ON "customers" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_vins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "order_id" uuid NOT NULL, "vin" character varying NOT NULL, "model" character varying, "color" character varying, "vehicleType" character varying, "isAllocated" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_3812ed01b93616afcc4490d01fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97938caaaa3d24cf0f9bb49835" ON "order_vins" ("vin") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_transporttype_enum" AS ENUM('TRANSFER', 'REALLOCATION', 'DELIVERY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "orderCode" character varying NOT NULL, "customer_id" uuid NOT NULL, "transportType" "public"."orders_transporttype_enum" NOT NULL, "originText" character varying, "destinationText" character varying, "remark" text, CONSTRAINT "UQ_a97c808a83af1497276bf85e5ba" UNIQUE ("orderCode"), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3b13df1eb3b062fd5ed4ebc53b" ON "orders" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "drivers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "carrier_id" uuid NOT NULL, "name" character varying NOT NULL, "phone" character varying, "licenseNo" character varying, "bankAccountName" character varying, "bankAccountNo" character varying, "bankName" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_92ab3fb69e566d3eb0cae896047" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."carrier_vehicles_towtype_enum" AS ENUM('CC', 'TOWING', 'TANSYA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "carrier_vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "carrier_id" uuid NOT NULL, "plateNumber" character varying NOT NULL, "towType" "public"."carrier_vehicles_towtype_enum", "lastLocation" geometry(Point,4326), "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_6e415edcae593fd2f8ce0893fab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."carriers_type_enum" AS ENUM('EXTERNAL', 'SELF_OWNED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "carriers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying NOT NULL, "type" "public"."carriers_type_enum" NOT NULL DEFAULT 'EXTERNAL', "contactName" character varying, "contactPhone" character varying, "email" character varying, "quotationNote" text, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_fe886e72b3d9f67da3ce70f4368" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_10f4c349b0ee2399780edf72fe" ON "carriers" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "waybill_vins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "waybill_id" uuid NOT NULL, "vin" character varying NOT NULL, "model" character varying, "color" character varying, "vehicleType" character varying, "isSigned" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_a15503e6f687152adc4d6bf25de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cca145985c5b2cbbecb11f7d60" ON "waybill_vins" ("vin") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."waybills_transporttype_enum" AS ENUM('TRANSFER', 'REALLOCATION', 'DELIVERY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."waybills_towtype_enum" AS ENUM('CC', 'TOWING', 'TANSYA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."waybills_status_enum" AS ENUM('NOT_ARRIVED', 'IN_TRANSIT', 'ARRIVED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "waybills" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "waybillCode" character varying NOT NULL, "customerWaybillCode" character varying, "transportType" "public"."waybills_transporttype_enum" NOT NULL, "order_id" uuid, "origin_yard_id" uuid, "originText" character varying, "destination_yard_id" uuid, "destination_dealer_id" uuid, "carrier_id" uuid, "driver_id" uuid, "vehicle_id" uuid, "towType" "public"."waybills_towtype_enum", "status" "public"."waybills_status_enum" NOT NULL DEFAULT 'NOT_ARRIVED', "isLocked" boolean NOT NULL DEFAULT false, "travelExpensePaid" boolean NOT NULL DEFAULT false, "remark" text, CONSTRAINT "UQ_ab5b5e7cb5df9d2a9a2395125a4" UNIQUE ("waybillCode"), CONSTRAINT "PK_38b1c7d5ec2d0183970dd279134" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e90b9b94b77dce2cf2d838b51" ON "waybills" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_organization_memberships_role_enum" AS ENUM('HQ_ADMIN', 'ORG_ADMIN', 'YARD_STAFF', 'CUSTOMER', 'CARRIER_STAFF', 'CARRIER_DRIVER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_organization_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "role" "public"."user_organization_memberships_role_enum" NOT NULL, CONSTRAINT "UQ_8a923aa27adcc9f8420c6844647" UNIQUE ("user_id", "organization_id"), CONSTRAINT "PK_67a0f13e9780a6529709487d8b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6269a39dbc22b2f0bfe2d11c6f" ON "user_organization_memberships" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_db946a54525db3dfc87faa8a49" ON "user_organization_memberships" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('HQ_ADMIN', 'ORG_ADMIN', 'YARD_STAFF', 'CUSTOMER', 'CARRIER_STAFF', 'CARRIER_DRIVER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "username" character varying NOT NULL, "passwordHash" character varying NOT NULL, "displayName" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL, "scope_yard_id" uuid, "carrier_id" uuid, "customer_id" uuid, "email" character varying, "passwordResetToken" character varying, "passwordResetExpiresAt" TIMESTAMP WITH TIME ZONE, "feishuOpenId" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3e35bcd3edcb05c1323b95f70" ON "users" ("scope_yard_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c63c0ce4bd7bfc551dec79a2d" ON "users" ("carrier_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c7bc1ffb56c570f42053fa7503" ON "users" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."waybill_status_logs_action_enum" AS ENUM('INBOUND_ARRIVAL', 'REALLOCATION_DEPARTURE', 'REALLOCATION_ARRIVAL', 'DELIVERY_DEPARTURE', 'SIGNED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "waybill_status_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "waybill_id" uuid NOT NULL, "vin" character varying NOT NULL, "action" "public"."waybill_status_logs_action_enum" NOT NULL, "yard_id" uuid, "operator_user_id" uuid, "vehicleCheckInfo" jsonb, "attachmentUrls" text array, "remark" text, CONSTRAINT "PK_49e9c50795316f6bdb7e8f66e7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46b2be99167aa06f3efd979b42" ON "waybill_status_logs" ("vin") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_targettype_enum" AS ENUM('CARRIER', 'CUSTOMER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invitations_inviteerole_enum" AS ENUM('HQ_ADMIN', 'ORG_ADMIN', 'YARD_STAFF', 'CUSTOMER', 'CARRIER_STAFF', 'CARRIER_DRIVER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying NOT NULL, "targetType" "public"."invitations_targettype_enum" NOT NULL, "target_id" uuid NOT NULL, "inviteeRole" "public"."invitations_inviteerole_enum" NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "used_by_user_id" uuid, "usedAt" TIMESTAMP WITH TIME ZONE, "created_by_user_id" uuid, CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e577dcf9bb6d084373ed399850" ON "invitations" ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."finance_records_type_enum" AS ENUM('REVENUE', 'COST', 'TRAVEL_EXPENSE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."finance_records_currency_enum" AS ENUM('IDR', 'MYR', 'THB', 'VND', 'PHP')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."finance_records_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'SUBMITTED_OA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "finance_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "waybill_id" uuid NOT NULL, "type" "public"."finance_records_type_enum" NOT NULL, "customer_id" uuid, "carrier_id" uuid, "amount" numeric(14,2) NOT NULL DEFAULT '0', "currency" "public"."finance_records_currency_enum" NOT NULL, "status" "public"."finance_records_status_enum" NOT NULL DEFAULT 'PENDING', "invoiceRef" character varying, "remark" text, CONSTRAINT "PK_fa96ad926c6fef153a00736aeab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad4a9164191151b584d5b32112" ON "finance_records" ("organization_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD CONSTRAINT "FK_f3a7c9411eaa5f9cbc5363de331" FOREIGN KEY ("parent_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "yard_slots" ADD CONSTRAINT "FK_599e3ae612d7f0312443e2617db" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "yards" ADD CONSTRAINT "FK_78807529b99a5a8176054c7234b" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD CONSTRAINT "FK_6be4e1a698f5c3f2c2e4c75c186" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" ADD CONSTRAINT "FK_f2bf4b8066104e366b32493f752" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_3b13df1eb3b062fd5ed4ebc53bf" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD CONSTRAINT "FK_97a822c4be3419a9f0d6b600a5e" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carrier_vehicles" ADD CONSTRAINT "FK_b3856631bd3e430b0b15f0c8c1f" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carriers" ADD CONSTRAINT "FK_10f4c349b0ee2399780edf72fee" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_vins" ADD CONSTRAINT "FK_e1481c9ee413d7150f2e8aac55c" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_5e90b9b94b77dce2cf2d838b517" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_b5c1eeb0d73d716adf159ec6d3b" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_07114ab2d9e3e30c0b279df24b9" FOREIGN KEY ("origin_yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_7b6ea208dfd2ecac326ee908fc7" FOREIGN KEY ("destination_yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_40f409a2fcb1250f0166db8c1dd" FOREIGN KEY ("destination_dealer_id") REFERENCES "customer_addresses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_37a08f6bed36c8eebce86b7caf8" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_4bc7858657cbac3d62ac5225ebc" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" ADD CONSTRAINT "FK_169c4d98db3a661f5b5c9db99a1" FOREIGN KEY ("vehicle_id") REFERENCES "carrier_vehicles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_organization_memberships" ADD CONSTRAINT "FK_6269a39dbc22b2f0bfe2d11c6f9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_organization_memberships" ADD CONSTRAINT "FK_db946a54525db3dfc87faa8a49f" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a3e35bcd3edcb05c1323b95f704" FOREIGN KEY ("scope_yard_id") REFERENCES "yards"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_7c63c0ce4bd7bfc551dec79a2d4" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_c7bc1ffb56c570f42053fa7503b" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_status_logs" ADD CONSTRAINT "FK_5bdfc9a641aadab134150c293b9" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_status_logs" ADD CONSTRAINT "FK_6f6cada0b85a7e8e08b81ac3b23" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_status_logs" ADD CONSTRAINT "FK_36828d221ac94a9828673ea6103" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_d129b333d6653f06d8ae2d07af1" FOREIGN KEY ("used_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_be7812657eb985174a262a61b93" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" ADD CONSTRAINT "FK_ad4a9164191151b584d5b321122" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" ADD CONSTRAINT "FK_ae30bc223649b576d67beb77947" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" ADD CONSTRAINT "FK_aad597b02a0eac3db8f0b697c66" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" ADD CONSTRAINT "FK_7ae880195ae09adb5b790026dcf" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "finance_records" DROP CONSTRAINT "FK_7ae880195ae09adb5b790026dcf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" DROP CONSTRAINT "FK_aad597b02a0eac3db8f0b697c66"`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" DROP CONSTRAINT "FK_ae30bc223649b576d67beb77947"`,
    );
    await queryRunner.query(
      `ALTER TABLE "finance_records" DROP CONSTRAINT "FK_ad4a9164191151b584d5b321122"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_be7812657eb985174a262a61b93"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_d129b333d6653f06d8ae2d07af1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_status_logs" DROP CONSTRAINT "FK_36828d221ac94a9828673ea6103"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_status_logs" DROP CONSTRAINT "FK_6f6cada0b85a7e8e08b81ac3b23"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_status_logs" DROP CONSTRAINT "FK_5bdfc9a641aadab134150c293b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_c7bc1ffb56c570f42053fa7503b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_7c63c0ce4bd7bfc551dec79a2d4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a3e35bcd3edcb05c1323b95f704"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_organization_memberships" DROP CONSTRAINT "FK_db946a54525db3dfc87faa8a49f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_organization_memberships" DROP CONSTRAINT "FK_6269a39dbc22b2f0bfe2d11c6f9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_169c4d98db3a661f5b5c9db99a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_4bc7858657cbac3d62ac5225ebc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_37a08f6bed36c8eebce86b7caf8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_40f409a2fcb1250f0166db8c1dd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_7b6ea208dfd2ecac326ee908fc7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_07114ab2d9e3e30c0b279df24b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_b5c1eeb0d73d716adf159ec6d3b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybills" DROP CONSTRAINT "FK_5e90b9b94b77dce2cf2d838b517"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waybill_vins" DROP CONSTRAINT "FK_e1481c9ee413d7150f2e8aac55c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carriers" DROP CONSTRAINT "FK_10f4c349b0ee2399780edf72fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carrier_vehicles" DROP CONSTRAINT "FK_b3856631bd3e430b0b15f0c8c1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP CONSTRAINT "FK_97a822c4be3419a9f0d6b600a5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_3b13df1eb3b062fd5ed4ebc53bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_vins" DROP CONSTRAINT "FK_f2bf4b8066104e366b32493f752"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP CONSTRAINT "FK_6be4e1a698f5c3f2c2e4c75c186"`,
    );
    await queryRunner.query(
      `ALTER TABLE "yards" DROP CONSTRAINT "FK_78807529b99a5a8176054c7234b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "yard_slots" DROP CONSTRAINT "FK_599e3ae612d7f0312443e2617db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP CONSTRAINT "FK_f3a7c9411eaa5f9cbc5363de331"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ad4a9164191151b584d5b32112"`,
    );
    await queryRunner.query(`DROP TABLE "finance_records"`);
    await queryRunner.query(`DROP TYPE "public"."finance_records_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."finance_records_currency_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."finance_records_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e577dcf9bb6d084373ed399850"`,
    );
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(
      `DROP TYPE "public"."invitations_inviteerole_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."invitations_targettype_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_46b2be99167aa06f3efd979b42"`,
    );
    await queryRunner.query(`DROP TABLE "waybill_status_logs"`);
    await queryRunner.query(
      `DROP TYPE "public"."waybill_status_logs_action_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c7bc1ffb56c570f42053fa7503"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c63c0ce4bd7bfc551dec79a2d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a3e35bcd3edcb05c1323b95f70"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_db946a54525db3dfc87faa8a49"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6269a39dbc22b2f0bfe2d11c6f"`,
    );
    await queryRunner.query(`DROP TABLE "user_organization_memberships"`);
    await queryRunner.query(
      `DROP TYPE "public"."user_organization_memberships_role_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e90b9b94b77dce2cf2d838b51"`,
    );
    await queryRunner.query(`DROP TABLE "waybills"`);
    await queryRunner.query(`DROP TYPE "public"."waybills_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."waybills_towtype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."waybills_transporttype_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cca145985c5b2cbbecb11f7d60"`,
    );
    await queryRunner.query(`DROP TABLE "waybill_vins"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_10f4c349b0ee2399780edf72fe"`,
    );
    await queryRunner.query(`DROP TABLE "carriers"`);
    await queryRunner.query(`DROP TYPE "public"."carriers_type_enum"`);
    await queryRunner.query(`DROP TABLE "carrier_vehicles"`);
    await queryRunner.query(
      `DROP TYPE "public"."carrier_vehicles_towtype_enum"`,
    );
    await queryRunner.query(`DROP TABLE "drivers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b13df1eb3b062fd5ed4ebc53b"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_transporttype_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97938caaaa3d24cf0f9bb49835"`,
    );
    await queryRunner.query(`DROP TABLE "order_vins"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d2fc0e42b07d01fafc3fbb2bee"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "customer_addresses"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_78807529b99a5a8176054c7234"`,
    );
    await queryRunner.query(`DROP TABLE "yards"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_be019a36a32bf9ca5350b94086"`,
    );
    await queryRunner.query(`DROP TABLE "yard_slots"`);
    await queryRunner.query(`DROP TYPE "public"."yard_slots_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f3a7c9411eaa5f9cbc5363de33"`,
    );
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(
      `DROP TYPE "public"."organizations_defaultcurrency_enum"`,
    );
  }
}
