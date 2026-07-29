import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { OrganizationsService } from '../modules/organizations/organizations.service';
import { Role } from '../common/enums/role.enum';
import { Currency } from '../common/enums/currency.enum';
import { Organization } from '../modules/organizations/entities/organization.entity';
import { User } from '../modules/users/entities/user.entity';
import { UserOrganizationMembership } from '../modules/users/entities/user-organization-membership.entity';
import { OrganizationOperatingPolicy } from '../modules/organizations/entities/organization-operating-policy.entity';

// 最小化生产 seed：只做"启动系统必要的骨架"，其他所有业务实体（场地/承运商/客户/司机等）
// 都在 admin 登录后通过管理界面自行创建，避免测试数据污染生产库。
//
// 会创建：
//   1. HQ 总部机构 (code=HQ, parentId=null) —— 组织树根
//   2. 5 个东南亚国家节点 (ID/MY/TH/VN/PH) 挂 HQ 下 —— 多国架构骨架
//   3. 每个机构一份 OrganizationOperatingPolicy —— 时区/日切/告警阈值默认值
//   4. admin 主账号 (HQ_ADMIN) —— 唯一初始入口，登录后立即改密码 & 建业务用户
//
// 幂等：反复跑不会重复创建，已存在则 skip。
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const organizationsService = app.get(OrganizationsService);

  void Organization; // keep entity import for typing
  const userRepo = dataSource.getRepository(User);
  const membershipRepo = dataSource.getRepository(UserOrganizationMembership);
  const operatingPolicyRepo = dataSource.getRepository(
    OrganizationOperatingPolicy,
  );

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
      { code: 'ID', name: 'Indonesia', currency: Currency.IDR },
      { code: 'MY', name: 'Malaysia', currency: Currency.MYR },
      { code: 'TH', name: 'Thailand', currency: Currency.THB },
      { code: 'VN', name: 'Vietnam', currency: Currency.VND },
      { code: 'PH', name: 'Philippines', currency: Currency.PHP },
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
  console.log('ensured 5 country organizations under HQ');

  // 3. 每个机构一份运营策略（时区 + 日切时刻 + 告警阈值）
  const timezoneByCode: Record<string, string> = {
    HQ: 'UTC',
    ID: 'Asia/Jakarta',
    MY: 'Asia/Kuala_Lumpur',
    TH: 'Asia/Bangkok',
    VN: 'Asia/Ho_Chi_Minh',
    PH: 'Asia/Manila',
  };
  const allOrganizations = await organizationsService.findAllUnscoped();
  for (const organization of allOrganizations) {
    const existingPolicy = await operatingPolicyRepo.findOne({
      where: { organizationId: organization.id },
    });
    if (!existingPolicy) {
      const now = new Date();
      await operatingPolicyRepo.save(
        operatingPolicyRepo.create({
          organizationId: organization.id,
          timezone: timezoneByCode[organization.code] ?? 'UTC',
          businessDayCutoff: '02:00:00',
          snapshotEnabled: true,
          snapshotStartedAt: now,
          longStayDays: 7,
          lockTimeoutHours: 24,
          utilizationWarningPercent: 80,
          utilizationCriticalPercent: 90,
          expectedArrivalWarningHours: 24,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }

  // 4. admin 主账号 —— 系统唯一初始入口
  const passHash = async (pw: string) => bcrypt.hash(pw, 10);
  const existingAdmin = await userRepo.findOne({ where: { username: 'admin' } });
  if (!existingAdmin) {
    const admin = await userRepo.save(
      userRepo.create({
        username: 'admin',
        passwordHash: await passHash('Admin@12345'),
        displayName: '总部管理员',
        role: Role.HQ_ADMIN,
      }),
    );
    await membershipRepo.save(
      membershipRepo.create({
        userId: admin.id,
        organizationId: hq.id,
        role: Role.HQ_ADMIN,
      }),
    );
    console.log('created admin: admin / Admin@12345 (⚠ 上线后立即改密码)');
  } else {
    console.log('admin exists, skipped');
  }

  console.log('');
  console.log('✓ Seed 完成。下一步：');
  console.log('  1. 登录 admin / Admin@12345 → 立即改密码');
  console.log('  2. 在管理界面创建：机构管理员 / 场地 / 库位 / 承运商 / 客户 / 司机');

  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
