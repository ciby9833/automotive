import { MigrationInterface, QueryRunner } from 'typeorm';

// 固定本次迁移的授权模板；运行时不兼容旧授权字段。
const INITIAL_PERMISSIONS = {
  HQ_ADMIN: [
    'transport:view',
    'yard:view-board',
    'yard:view-vin-inventory',
    'order:view',
    'waybill:view',
    'partner:carrier-view',
    'partner:customer-view',
    'finance:view',
    'setup:user-crud',
    'setup:user-membership',
    'org:view',
    'org:crud',
    'tracking:view',
    'inbound:view',
    'pickup:view',
    'outbound:view',
    'carrier:user-view',
    'carrier:user-manage',
    'system:app-release-manage',
    'system:snapshot-manage',
  ],
  ORG_ADMIN: [
    'yard:view-board',
    'yard:assign-slot',
    'yard:release-slot',
    'yard:move-vehicle',
    'yard:view-vin-inventory',
    'setup:yard-crud',
    'setup:zone-crud',
    'order:view',
    'order:create',
    'waybill:view',
    'waybill:create',
    'waybill:scan',
    'partner:carrier-view',
    'partner:carrier-crud',
    'partner:customer-view',
    'partner:customer-crud',
    'partner:invite',
    'finance:view',
    'finance:confirm',
    'finance:send-bill',
    'finance:create',
    'setup:user-crud',
    'setup:user-membership',
    'org:view',
    'tracking:view',
    'inbound:import',
    'inbound:view',
    'inbound:scan',
    'inbound:batch-manage',
    'pickup:view',
    'outbound:import',
    'outbound:view',
    'outbound:plan',
    'carrier:user-view',
    'carrier:user-manage',
    'transport:view',
    'transport:order-manage',
    'transport:dispatch',
    'transport:execute',
    'transport:finance',
    'file:upload',
  ],
  YARD_STAFF: [
    'yard:view-board',
    'yard:assign-slot',
    'yard:release-slot',
    'yard:move-vehicle',
    'yard:view-vin-inventory',
    'waybill:view',
    'waybill:scan',
    'org:view',
    'tracking:view',
    'inbound:view',
    'inbound:scan',
    'inbound:batch-manage',
    'pickup:view',
    'outbound:view',
    'outbound:plan',
    'file:upload',
  ],
};

export class MembershipAuthorization1790100000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE user_organization_memberships
      ADD COLUMN permissions text[] NOT NULL DEFAULT '{}',
      ADD COLUMN scope_yard_id uuid REFERENCES yards(id) ON DELETE RESTRICT,
      ADD COLUMN is_active boolean NOT NULL DEFAULT true`);
    await q.query(`UPDATE user_organization_memberships m SET scope_yard_id=u.scope_yard_id
      FROM users u WHERE u.id=m.user_id AND m.role='YARD_STAFF'`);
    await q.query('ALTER TABLE users DROP COLUMN scope_yard_id');
    for (const [role, permissions] of Object.entries(INITIAL_PERMISSIONS))
      await q.query(
        'UPDATE user_organization_memberships SET permissions=$1 WHERE role=$2',
        [permissions, role],
      );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE users ADD COLUMN scope_yard_id uuid REFERENCES yards(id) ON DELETE SET NULL',
    );
    await q.query(`UPDATE users u SET scope_yard_id=m.scope_yard_id FROM user_organization_memberships m
      WHERE m.user_id=u.id AND m.scope_yard_id IS NOT NULL`);
    await q.query(`ALTER TABLE user_organization_memberships DROP COLUMN is_active,
      DROP COLUMN scope_yard_id, DROP COLUMN permissions`);
  }
}
