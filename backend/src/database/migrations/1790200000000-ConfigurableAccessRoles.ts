import { MigrationInterface, QueryRunner } from 'typeorm';

// 冻结本次转换目录；不在运行时兼容成员上的旧权限字段。
const CATALOG = {
  menus: [
    {"permission":"menu:dashboard","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF"],"read":["yard:view-board","org:view"],"actions":["system:snapshot-manage"]},
    {"permission":"menu:transport","types":["HQ_ADMIN","ORG_ADMIN","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"],"read":["transport:view","partner:customer-view","partner:carrier-view","org:view"],"actions":["transport:order-manage","transport:dispatch","transport:execute"]},
    {"permission":"menu:inbound-import","types":["ORG_ADMIN"],"read":["inbound:view","yard:view-board","partner:customer-view","partner:carrier-view","org:view"],"actions":["inbound:import"]},
    {"permission":"menu:inbound-orders","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CUSTOMER"],"read":["inbound:view","org:view"],"actions":["inbound:import","inbound:batch-manage"]},
    {"permission":"menu:inbound-scan","types":["ORG_ADMIN","YARD_STAFF"],"read":["inbound:view","yard:view-board","org:view"],"actions":["inbound:scan","inbound:batch-manage"]},
    {"permission":"menu:pickup","types":["CARRIER_STAFF","CARRIER_DRIVER"],"read":["pickup:view"],"actions":["pickup:scan"]},
    {"permission":"menu:outbound-import","types":["ORG_ADMIN"],"read":["outbound:view","yard:view-board","partner:customer-view","org:view"],"actions":["outbound:import"]},
    {"permission":"menu:outbound-orders","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CUSTOMER"],"read":["outbound:view","org:view"],"actions":["outbound:import"]},
    {"permission":"menu:outbound-plan","types":["HQ_ADMIN","ORG_ADMIN"],"read":["outbound:view","yard:view-board","partner:carrier-view","partner:customer-view","org:view"],"actions":["outbound:plan"]},
    {"permission":"menu:outbound-departure","types":["ORG_ADMIN","YARD_STAFF"],"read":["waybill:view","yard:view-board","org:view"],"actions":["waybill:scan"]},
    {"permission":"menu:delivery-sign","types":["ORG_ADMIN","CARRIER_STAFF","CARRIER_DRIVER"],"read":["waybill:view","org:view"],"actions":["waybill:scan"]},
    {"permission":"menu:waybills","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"],"read":["waybill:view","yard:view-board","partner:carrier-view","org:view"],"actions":["waybill:create","waybill:scan"]},
    {"permission":"menu:yard-board","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF"],"read":["yard:view-board","org:view"],"actions":["yard:assign-slot","yard:release-slot","yard:move-vehicle"]},
    {"permission":"menu:yard-batch-assign","types":["ORG_ADMIN","YARD_STAFF"],"read":["yard:view-board","yard:view-vin-inventory","org:view"],"actions":["yard:move-vehicle"]},
    {"permission":"menu:vin-inventory","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CUSTOMER"],"read":["yard:view-vin-inventory","org:view"],"actions":[]},
    {"permission":"menu:tracking","types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"],"read":["tracking:view","org:view"],"actions":[]},
    {"permission":"menu:finance","types":["HQ_ADMIN","ORG_ADMIN","CUSTOMER"],"read":["finance:view","partner:customer-view","org:view"],"actions":["finance:create","finance:confirm","finance:send-bill"]},
    {"permission":"menu:transport-finance","types":["HQ_ADMIN","ORG_ADMIN"],"read":["transport:finance-view","org:view"],"actions":["transport:finance"]},
    {"permission":"menu:customers","types":["HQ_ADMIN","ORG_ADMIN","CUSTOMER"],"read":["partner:customer-view","org:view"],"actions":["partner:customer-crud","partner:invite"]},
    {"permission":"menu:carriers","types":["HQ_ADMIN","ORG_ADMIN","CARRIER_STAFF"],"read":["partner:carrier-view","org:view"],"actions":["partner:carrier-crud","carrier:user-view","carrier:user-manage","partner:invite"]},
    {"permission":"menu:my-carrier-users","types":["CARRIER_STAFF"],"read":["carrier:user-view"],"actions":["carrier:user-manage"]},
    {"permission":"menu:my-carrier-fleet","types":["CARRIER_STAFF"],"read":["partner:carrier-view"],"actions":["partner:carrier-crud"]},
    {"permission":"menu:setup-organizations","types":["HQ_ADMIN"],"read":["org:view"],"actions":["org:crud"]},
    {"permission":"menu:setup-yards","types":["HQ_ADMIN","ORG_ADMIN"],"read":["yard:view-board","org:view"],"actions":["setup:yard-crud"]},
    {"permission":"menu:setup-slots","types":["HQ_ADMIN","ORG_ADMIN"],"read":["yard:view-board","org:view"],"actions":["setup:zone-crud"]},
    {"permission":"menu:users","types":["HQ_ADMIN","ORG_ADMIN"],"read":["setup:user-view","org:view"],"actions":["setup:user-crud","setup:user-membership"]},
    {"permission":"menu:roles","types":["HQ_ADMIN","ORG_ADMIN"],"read":["setup:role-view","org:view"],"actions":["setup:role-manage"]},
    {"permission":"menu:app-releases","types":["HQ_ADMIN"],"read":["system:app-release-view","org:view"],"actions":["system:app-release-manage"]},
  ],
  actions: {
    "setup:role-view": {"types":["HQ_ADMIN","ORG_ADMIN"]},
    "setup:role-manage": {"types":["HQ_ADMIN","ORG_ADMIN"],"requires":["setup:role-view"]},
    "setup:user-view": {"types":["HQ_ADMIN","ORG_ADMIN"]},
    "setup:user-crud": {"types":["HQ_ADMIN","ORG_ADMIN"],"requires":["setup:user-view"]},
    "setup:user-membership": {"types":["HQ_ADMIN","ORG_ADMIN"],"requires":["setup:user-view"]},
    "org:view": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF"]},
    "org:crud": {"types":["HQ_ADMIN"],"requires":["org:view"]},
    "yard:view-board": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF"]},
    "yard:view-vin-inventory": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CUSTOMER"]},
    "yard:assign-slot": {"types":["ORG_ADMIN","YARD_STAFF"],"requires":["yard:view-board"]},
    "yard:release-slot": {"types":["ORG_ADMIN","YARD_STAFF"],"requires":["yard:view-board"]},
    "yard:move-vehicle": {"types":["ORG_ADMIN","YARD_STAFF"],"requires":["yard:view-board","yard:view-vin-inventory"]},
    "setup:yard-crud": {"types":["ORG_ADMIN"],"requires":["yard:view-board","org:view"]},
    "setup:zone-crud": {"types":["ORG_ADMIN"],"requires":["yard:view-board","org:view"]},
    "order:view": {"types":["HQ_ADMIN","ORG_ADMIN","CUSTOMER"]},
    "order:create": {"types":["ORG_ADMIN"],"requires":["order:view"]},
    "waybill:view": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"]},
    "waybill:create": {"types":["ORG_ADMIN"],"requires":["waybill:view","partner:carrier-view"]},
    "waybill:scan": {"types":["ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER"],"requires":["waybill:view","file:upload"]},
    "partner:carrier-view": {"types":["HQ_ADMIN","ORG_ADMIN","CARRIER_STAFF"]},
    "partner:carrier-crud": {"types":["ORG_ADMIN","CARRIER_STAFF"],"requires":["partner:carrier-view"]},
    "partner:customer-view": {"types":["HQ_ADMIN","ORG_ADMIN","CUSTOMER"]},
    "partner:customer-crud": {"types":["ORG_ADMIN"],"requires":["partner:customer-view"]},
    "partner:invite": {"types":["ORG_ADMIN"]},
    "carrier:user-view": {"types":["HQ_ADMIN","ORG_ADMIN","CARRIER_STAFF"]},
    "carrier:user-manage": {"types":["HQ_ADMIN","ORG_ADMIN","CARRIER_STAFF"],"requires":["carrier:user-view"]},
    "finance:view": {"types":["HQ_ADMIN","ORG_ADMIN","CUSTOMER"]},
    "finance:confirm": {"types":["ORG_ADMIN","CUSTOMER"],"requires":["finance:view"]},
    "finance:send-bill": {"types":["ORG_ADMIN"],"requires":["finance:view"]},
    "finance:create": {"types":["ORG_ADMIN"],"requires":["finance:view","partner:carrier-view","partner:customer-view"]},
    "tracking:view": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"]},
    "inbound:view": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CUSTOMER"],"requires":["pickup:view"]},
    "inbound:import": {"types":["ORG_ADMIN"],"requires":["inbound:view","yard:view-board","partner:customer-view","partner:carrier-view"]},
    "inbound:scan": {"types":["ORG_ADMIN","YARD_STAFF"],"requires":["inbound:view","yard:view-board","file:upload"]},
    "inbound:batch-manage": {"types":["ORG_ADMIN","YARD_STAFF"],"requires":["inbound:view","yard:view-board"]},
    "pickup:view": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"]},
    "pickup:scan": {"types":["CARRIER_STAFF","CARRIER_DRIVER"],"requires":["pickup:view","file:upload"]},
    "outbound:view": {"types":["HQ_ADMIN","ORG_ADMIN","YARD_STAFF","CUSTOMER"]},
    "outbound:import": {"types":["ORG_ADMIN"],"requires":["outbound:view","yard:view-board","partner:customer-view"]},
    "outbound:plan": {"types":["ORG_ADMIN"],"requires":["outbound:view","yard:view-board","partner:carrier-view","partner:customer-view"]},
    "transport:view": {"types":["HQ_ADMIN","ORG_ADMIN","CARRIER_STAFF","CARRIER_DRIVER","CUSTOMER"]},
    "transport:order-manage": {"types":["ORG_ADMIN"],"requires":["transport:view","partner:customer-view"]},
    "transport:dispatch": {"types":["ORG_ADMIN","CARRIER_STAFF"],"requires":["transport:view","partner:carrier-view"]},
    "transport:execute": {"types":["ORG_ADMIN","CARRIER_STAFF","CARRIER_DRIVER"],"requires":["transport:view","file:upload"]},
    "transport:finance-view": {"types":["HQ_ADMIN","ORG_ADMIN"],"requires":["transport:view","partner:customer-view","partner:carrier-view"]},
    "transport:finance": {"types":["ORG_ADMIN"],"requires":["transport:finance-view"]},
    "system:app-release-view": {"types":["HQ_ADMIN"]},
    "system:app-release-manage": {"types":["HQ_ADMIN"],"requires":["system:app-release-view"]},
    "system:snapshot-manage": {"types":["HQ_ADMIN"],"requires":["yard:view-board"]},
    "file:upload": {"types":["ORG_ADMIN","YARD_STAFF","CARRIER_STAFF","CARRIER_DRIVER"]},
  },
};
function expand(codes: string[]): string[] {
  const result = new Set(codes);
  for (const menu of CATALOG.menus) if (result.has(menu.permission)) for (const p of menu.read) result.add(p);
  const add = (p: string) => {
    for (const dependency of (CATALOG.actions as Record<string, {requires?: string[]}>)[p]?.requires ?? []) {
      if (!result.has(dependency)) { result.add(dependency); add(dependency); }
    }
  };
  for (const p of [...result]) add(p);
  return [...result].filter((p) => !p.startsWith('menu:'));
}

export class ConfigurableAccessRoles1790200000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE access_roles (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      name varchar NOT NULL, description varchar NOT NULL DEFAULT '',
      type varchar NOT NULL CHECK (type IN ('HQ_ADMIN','ORG_ADMIN','YARD_STAFF')),
      permissions text[] NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query('CREATE UNIQUE INDEX access_roles_org_name ON access_roles(organization_id, lower(name))');
    await q.query(`CREATE TABLE membership_access_roles (
      membership_id uuid NOT NULL REFERENCES user_organization_memberships(id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES access_roles(id) ON DELETE RESTRICT,
      PRIMARY KEY (membership_id, role_id)
    )`);
    await q.query('CREATE INDEX membership_access_roles_role ON membership_access_roles(role_id)');
    const members: Array<{id: string; organization_id: string; role: string; permissions: string[]}> =
      await q.query('SELECT id, organization_id, role, permissions FROM user_organization_memberships ORDER BY organization_id, created_at');
    const groups = new Map<string, string>();
    let sequence = 0;
    for (const m of members) {
      const old = new Set(m.permissions);
      if (old.has('transport:view')) old.add('transport:finance-view');
      if (old.has('system:app-release-manage')) old.add('system:app-release-view');
      if (old.has('setup:user-crud') || old.has('setup:user-membership')) old.add('setup:user-view');
      if (old.has('setup:user-membership')) {
        old.add('setup:role-view'); old.add('setup:role-manage');
      }
      const menus = CATALOG.menus.filter((item) => (item.types as string[]).includes(m.role) &&
        (item.read.length ? item.read.filter((p) => (CATALOG.actions[p].types as string[]).includes(m.role)).every((p) => old.has(p)) : item.actions.some((p) => old.has(p))));
      const explicit = [...new Set(menus.flatMap((item) => [item.permission, ...item.actions.filter((p) =>
        old.has(p) && (CATALOG.actions[p].types as string[]).includes(m.role))]))].sort();
      const key = JSON.stringify([m.organization_id, m.role, explicit]);
      let roleId = groups.get(key);
      if (!roleId) {
        const [saved] = await q.query(`INSERT INTO access_roles(organization_id,name,description,type,permissions)
          VALUES($1,$2,$3,$4,$5) RETURNING id`, [m.organization_id, '初始权限角色 ' + (++sequence),
          '由现有授权转换，可按岗位重命名或重新分配', m.role, explicit]);
        roleId = saved.id as string; groups.set(key, roleId);
      }
      await q.query('INSERT INTO membership_access_roles(membership_id,role_id) VALUES($1,$2)', [m.id, roleId]);
    }
    await q.query('ALTER TABLE user_organization_memberships DROP COLUMN permissions');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE user_organization_memberships ADD COLUMN permissions text[] NOT NULL DEFAULT '{}'");
    const members: Array<{id: string; permissions: string[] | null}> = await q.query(`SELECT m.id,
      ARRAY(SELECT DISTINCT unnest(r.permissions) FROM membership_access_roles mr JOIN access_roles r ON r.id=mr.role_id
        WHERE mr.membership_id=m.id AND r.is_active) permissions FROM user_organization_memberships m`);
    for (const m of members) await q.query('UPDATE user_organization_memberships SET permissions=$1 WHERE id=$2', [expand(m.permissions ?? []), m.id]);
    await q.query('DROP TABLE membership_access_roles');
    await q.query('DROP TABLE access_roles');
  }
}
