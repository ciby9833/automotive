import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { OrganizationsService } from '../modules/organizations/organizations.service';
import { Role } from '../common/enums/role.enum';
import { CarrierType } from '../common/enums/carrier-type.enum';
import { Currency } from '../common/enums/currency.enum';
import { Organization } from '../modules/organizations/entities/organization.entity';
import { User } from '../modules/users/entities/user.entity';
import { UserOrganizationMembership } from '../modules/users/entities/user-organization-membership.entity';
import { Yard } from '../modules/yards/entities/yard.entity';
import { Carrier } from '../modules/carriers/entities/carrier.entity';
import { Customer } from '../modules/customers/entities/customer.entity';

// 本地/演示环境初始化数据：
//   HQ 作为 organizations 根节点(code='HQ', parentId=null)
//   5 个东南亚国家作为 HQ 的子节点
//   总部管理员挂在 HQ 上
//   印尼机构管理员挂在印尼节点上
//   印尼场地A/B + 场地A业务员(挂印尼节点 + scopeYardId)
//   示例供应商/客户(挂印尼节点)
// 生产环境上线前请务必修改/停用默认账号密码。所有创建都直接用 DataSource 避免 seed 与 service scope 校验缠斗。
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const organizationsService = app.get(OrganizationsService);

  // orgRepo intentionally omitted here — organizations are managed via OrganizationsService
  void Organization; // keep entity import for docs/reference
  const userRepo = dataSource.getRepository(User);
  const membershipRepo = dataSource.getRepository(UserOrganizationMembership);
  const yardRepo = dataSource.getRepository(Yard);
  const carrierRepo = dataSource.getRepository(Carrier);
  const customerRepo = dataSource.getRepository(Customer);

  // 1. HQ 根节点
  let hq = await organizationsService.findRoot();
  if (!hq) {
    hq = await organizationsService.createUnscoped({
      code: 'HQ',
      name: '总部',
      defaultCurrency: Currency.IDR, // HQ 本身不承接业务，占位
      parentId: null,
    });
    console.log('created HQ root organization');
  }

  // 2. 5 个国家节点
  const countryDefs: Array<{ code: string; name: string; currency: Currency }> =
    [
      { code: 'ID', name: '印度尼西亚', currency: Currency.IDR },
      { code: 'MY', name: '马来西亚', currency: Currency.MYR },
      { code: 'TH', name: '泰国', currency: Currency.THB },
      { code: 'VN', name: '越南', currency: Currency.VND },
      { code: 'PH', name: '菲律宾', currency: Currency.PHP },
    ];
  for (const def of countryDefs) {
    const existing = await organizationsService.findByCode(def.code);
    if (!existing) {
      await organizationsService.createUnscoped({
        code: def.code,
        name: def.name,
        defaultCurrency: def.currency,
        parentId: hq.id,
      });
    }
  }
  const indonesia = await organizationsService.findByCode('ID');
  const malaysia = await organizationsService.findByCode('MY');
  if (!indonesia || !malaysia) {
    throw new Error('国家节点未初始化成功');
  }
  console.log('ensured 5 country organizations under HQ');

  // 3. 内部账号 + memberships
  //    - admin: HQ_ADMIN, 挂 HQ 节点
  //    - id_org_admin: ORG_ADMIN, 挂印尼节点
  //    - multi_org_admin: ORG_ADMIN 在印尼 & 马来两个节点(演示多机构切换)
  //    - yard_a_staff: YARD_STAFF, 挂印尼节点 + scopeYardId=YARD_A
  const passHash = async (pw: string) => bcrypt.hash(pw, 10);
  const ensureInternalUser = async (
    username: string,
    password: string,
    displayName: string,
    role: Role,
    memberships: Array<{ organizationId: string; role: Role }>,
    scopeYardId: string | null = null,
  ) => {
    let user = await userRepo.findOne({ where: { username } });
    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          username,
          passwordHash: await passHash(password),
          displayName,
          role,
          scopeYardId,
        }),
      );
      console.log(`created internal user: ${username} / ${password}`);
    }
    for (const m of memberships) {
      const has = await membershipRepo.findOne({
        where: { userId: user.id, organizationId: m.organizationId },
      });
      if (!has) {
        await membershipRepo.save(
          membershipRepo.create({
            userId: user.id,
            organizationId: m.organizationId,
            role: m.role,
          }),
        );
      }
    }
    return user;
  };

  await ensureInternalUser(
    'admin',
    'Admin@12345',
    '总部管理员',
    Role.HQ_ADMIN,
    [{ organizationId: hq.id, role: Role.HQ_ADMIN }],
  );
  await ensureInternalUser(
    'id_org_admin',
    'OrgAdmin@12345',
    '印尼机构管理员',
    Role.ORG_ADMIN,
    [{ organizationId: indonesia.id, role: Role.ORG_ADMIN }],
  );
  await ensureInternalUser(
    'multi_org_admin',
    'MultiOrg@12345',
    '跨国机构管理员(演示多机构切换)',
    Role.ORG_ADMIN,
    [
      { organizationId: indonesia.id, role: Role.ORG_ADMIN },
      { organizationId: malaysia.id, role: Role.ORG_ADMIN },
    ],
  );

  // 4. 印尼场地A/B + 场地A业务员
  let yardA = await yardRepo.findOne({ where: { code: 'YARD_A' } });
  if (!yardA) {
    yardA = await yardRepo.save(
      yardRepo.create({
        organizationId: indonesia.id,
        code: 'YARD_A',
        name: '场地A',
      }),
    );
    await yardRepo.save(
      yardRepo.create({
        organizationId: indonesia.id,
        code: 'YARD_B',
        name: '场地B',
      }),
    );
    console.log('created yards YARD_A/YARD_B (印尼)');
  }
  await ensureInternalUser(
    'yard_a_staff',
    'YardA@12345',
    '场地A业务员',
    Role.YARD_STAFF,
    [{ organizationId: indonesia.id, role: Role.YARD_STAFF }],
    yardA.id,
  );

  // 5. 供应商：KMDI/IPP 等真实入库供应商
  let kmdi = await carrierRepo.findOne({ where: { shortName: 'KMDI' } });
  if (!kmdi) {
    kmdi = await carrierRepo.save(
      carrierRepo.create({
        organizationId: indonesia.id,
        name: 'PT. KMDI Logistics',
        shortName: 'KMDI',
        type: CarrierType.EXTERNAL,
      }),
    );
  }
  const ippExists = await carrierRepo.findOne({ where: { shortName: 'IPP' } });
  if (!ippExists) {
    await carrierRepo.save(
      carrierRepo.create({
        organizationId: indonesia.id,
        name: 'PT. IPP Cargo',
        shortName: 'IPP',
        type: CarrierType.EXTERNAL,
      }),
    );
  }
  const selfOwnedExists = await carrierRepo.findOne({
    where: { type: CarrierType.SELF_OWNED, organizationId: indonesia.id },
  });
  if (!selfOwnedExists) {
    await carrierRepo.save(
      carrierRepo.create({
        organizationId: indonesia.id,
        name: '自营车队',
        shortName: 'SELF',
        type: CarrierType.SELF_OWNED,
      }),
    );
  }
  console.log('ensured carriers: KMDI / IPP / SELF');

  // 6. 客户：BYD 是真实入库客户
  let byd = await customerRepo.findOne({ where: { name: 'BYD Indonesia' } });
  if (!byd) {
    byd = await customerRepo.save(
      customerRepo.create({
        organizationId: indonesia.id,
        name: 'BYD Indonesia',
      }),
    );
    console.log('created customer: BYD Indonesia');
  }

  // 7. 演示司机账号：挂 KMDI 供应商下
  const demoDriver = await userRepo.findOne({
    where: { username: 'kmdi_driver' },
  });
  if (!demoDriver) {
    await userRepo.save(
      userRepo.create({
        username: 'kmdi_driver',
        passwordHash: await passHash('KmdiDriver@12345'),
        displayName: 'KMDI 司机演示',
        role: Role.CARRIER_DRIVER,
        carrierId: kmdi.id,
      }),
    );
    console.log('created demo carrier driver: kmdi_driver / KmdiDriver@12345');
  }

  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
