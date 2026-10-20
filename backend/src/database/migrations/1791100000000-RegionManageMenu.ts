import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增「系统管理 → 行政区划」菜单。总部通常只有一个管理员账号，而账号不能修改分配给自己的角色，
 * 所以把菜单和维护权限直接加给已经有「机构管理」菜单的总部角色；机构管理员按需在角色管理里授予。
 */
export class RegionManageMenu1791100000000 implements MigrationInterface {
  name = 'RegionManageMenu1791100000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE access_roles
      SET permissions = (SELECT array_agg(DISTINCT p ORDER BY p)
                           FROM unnest(permissions || ARRAY['menu:setup-regions', 'setup:region-manage']::text[]) p),
          updated_at = now()
      WHERE type = 'HQ_ADMIN' AND 'menu:setup-organizations' = ANY(permissions)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE access_roles
      SET permissions = array_remove(array_remove(permissions, 'menu:setup-regions'), 'setup:region-manage')`);
  }
}
