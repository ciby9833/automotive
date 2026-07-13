import { MigrationInterface, QueryRunner } from 'typeorm';

// yard_slots 补两个字段：
//   assigned_at: 占用时间戳，用于 VIN 库存"停放天数"计算
//   isLocked: 业务锁定标志（客户扣留/司法查封等），日常运营看板显示但不允许操作
export class AddSlotAssignedAtAndLock1783567132435 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "yard_slots" ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "yard_slots" ADD COLUMN IF NOT EXISTS "isLocked" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "yard_slots" DROP COLUMN IF EXISTS "isLocked"`,
    );
    await queryRunner.query(
      `ALTER TABLE "yard_slots" DROP COLUMN IF EXISTS "assigned_at"`,
    );
  }
}
