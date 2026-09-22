import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { OrganizationOperatingPolicy } from './entities/organization-operating-policy.entity';
import { UpdateOperatingPolicyDto } from './dto/update-operating-policy.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    private readonly scopeService: ScopeService,
    private readonly dataSource: DataSource,
  ) {}

  // 内部账号只能看到自己 scope 下的机构树；外部账号只看到自己所属的一个节点（供 UI 展示"你属于哪家机构"用）
  async findAll(scope: EffectiveScope): Promise<Organization[]> {
    if (scope.type === 'ORG') {
      return this.organizationsRepository.find({
        where: { id: In(scope.orgIds), isActive: true },
        relations: { operatingPolicy: true },
        order: { name: 'ASC' },
      });
    }
    // 外部账号：从对应实体反查其归属 org，返回单条列表
    // 具体实现由前端在需要时自行去 /carriers/:id 或 /customers/:id 拉；这里返回空
    return [];
  }

  async findRoot(): Promise<Organization | null> {
    return this.organizationsRepository.findOne({
      where: { parentId: IsNull() },
    });
  }

  async findOne(id: string): Promise<Organization> {
    const organization = await this.organizationsRepository.findOne({
      where: { id },
      relations: { operatingPolicy: true },
    });
    if (!organization) throw new NotFoundException('机构不存在');
    return organization;
  }

  // 创建机构：非根机构必须指定 parentId 且父节点必须在 scope 内；根节点只能通过 seed 创建
  async create(
    dto: CreateOrganizationDto,
    scope: EffectiveScope,
  ): Promise<Organization> {
    await this.assertHeadquarters(scope);
    this.scopeService.assertOrgReadable(scope, dto.parentId);
    this.assertTimezone(dto.timezone);
    return this.dataSource.transaction(async (manager) => {
      await this.lockMaintenance(manager);
      await this.requireActiveParent(manager, dto.parentId);
      await this.assertUniqueCode(manager, dto.code);
      const parentPolicy = await manager.findOneByOrFail(
        OrganizationOperatingPolicy,
        { organizationId: dto.parentId },
      );
      const organization = await manager.save(
        Organization,
        manager.create(Organization, {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          defaultCurrency: dto.defaultCurrency,
          parentId: dto.parentId,
        }),
      );
      await manager.save(
        OrganizationOperatingPolicy,
        manager.create(OrganizationOperatingPolicy, {
          organizationId: organization.id,
          timezone: dto.timezone,
          businessDayCutoff: dto.businessDayCutoff,
          snapshotEnabled: parentPolicy.snapshotEnabled,
          snapshotStartedAt: new Date(),
          longStayDays: parentPolicy.longStayDays,
          lockTimeoutHours: parentPolicy.lockTimeoutHours,
          utilizationWarningPercent: parentPolicy.utilizationWarningPercent,
          utilizationCriticalPercent: parentPolicy.utilizationCriticalPercent,
          expectedArrivalWarningHours: parentPolicy.expectedArrivalWarningHours,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      return manager.findOneOrFail(Organization, {
        where: { id: organization.id },
        relations: { operatingPolicy: true },
      });
    });
  }

  // 维护列表保留停用节点；业务下拉仍走 findAll 的有效机构范围。
  async listManagement(scope: EffectiveScope): Promise<Organization[]> {
    await this.assertHeadquarters(scope);
    return this.organizationsRepository.find({
      where: {
        id: In(
          await this.scopeService.getDescendantOrgIds(
            scope.type === 'ORG' ? scope.activeOrgId : '',
            true,
          ),
        ),
      },
      relations: { operatingPolicy: true },
      order: { createdAt: 'ASC' },
    });
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    scope: EffectiveScope,
  ): Promise<Organization> {
    await this.assertManaged(id, scope);
    return this.dataSource.transaction(async (manager) => {
      await this.lockMaintenance(manager);
      const org = await manager.findOneByOrFail(Organization, { id });
      const codeChanged = dto.code !== undefined && dto.code !== org.code;
      const parentChanged =
        dto.parentId !== undefined && dto.parentId !== org.parentId;
      const currencyChanged =
        dto.defaultCurrency !== undefined &&
        dto.defaultCurrency !== org.defaultCurrency;
      if (!org.parentId && (codeChanged || parentChanged || currencyChanged)) {
        throw new BadRequestException('总部根机构仅允许修改名称和运营策略');
      }
      if (codeChanged) await this.assertUniqueCode(manager, dto.code!, id);
      if (parentChanged) {
        if (dto.parentId === id)
          throw new BadRequestException('上级机构不能是自身');
        const descendants = await this.scopeService.getDescendantOrgIds(
          id,
          true,
        );
        if (descendants.includes(dto.parentId!))
          throw new BadRequestException('上级机构不能是自己的下级');
        this.scopeService.assertOrgReadable(scope, dto.parentId!);
        await this.requireActiveParent(manager, dto.parentId!);
        await this.assertUnused(manager, id, true);
      } else if (currencyChanged) {
        await this.assertUnused(manager, id, false);
      }
      Object.assign(org, dto);
      await manager.save(org);
      return manager.findOneOrFail(Organization, {
        where: { id },
        relations: { operatingPolicy: true },
      });
    });
  }

  async setActive(
    id: string,
    isActive: boolean,
    scope: EffectiveScope,
  ): Promise<Organization> {
    await this.assertManaged(id, scope);
    return this.dataSource.transaction(async (manager) => {
      await this.lockMaintenance(manager);
      const org = await manager.findOneByOrFail(Organization, { id });
      if (!org.parentId) throw new BadRequestException('总部根机构不能停用');
      if (org.isActive !== isActive) {
        if (isActive) await this.requireActiveParent(manager, org.parentId);
        else await this.assertUnused(manager, id, true);
        org.isActive = isActive;
        await manager.save(org);
      }
      return manager.findOneOrFail(Organization, {
        where: { id },
        relations: { operatingPolicy: true },
      });
    });
  }

  private async assertHeadquarters(scope: EffectiveScope): Promise<void> {
    if (scope.type !== 'ORG' || scope.role !== Role.HQ_ADMIN)
      throw new ForbiddenException('仅总部管理员可维护机构');
    const root = await this.organizationsRepository.findOneBy({
      id: scope.activeOrgId,
      parentId: IsNull(),
      isActive: true,
    });
    if (!root) throw new ForbiddenException('请切换至总部机构后维护');
  }

  private async assertManaged(
    id: string,
    scope: EffectiveScope,
  ): Promise<void> {
    await this.assertHeadquarters(scope);
    const ids = await this.scopeService.getDescendantOrgIds(
      scope.type === 'ORG' ? scope.activeOrgId : '',
      true,
    );
    if (!ids.includes(id))
      throw new NotFoundException('机构不存在或不在总部管理范围');
  }

  private async lockMaintenance(manager: EntityManager): Promise<void> {
    // 串行化机构树维护与大小写无关的编码检查，避免并发改挂产生环。
    await manager.query('LOCK TABLE organizations IN SHARE ROW EXCLUSIVE MODE');
  }

  private async requireActiveParent(
    manager: EntityManager,
    id: string,
  ): Promise<void> {
    const parent = await manager.findOne(Organization, {
      where: { id, isActive: true },
      relations: { operatingPolicy: true },
    });
    if (!parent?.operatingPolicy)
      throw new BadRequestException('上级机构不存在、已停用或缺少运营策略');
  }

  private async assertUniqueCode(
    manager: EntityManager,
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const duplicate = await manager
      .getRepository(Organization)
      .createQueryBuilder('o')
      .where('UPPER(BTRIM(o.code)) = :code', {
        code: code.trim().toUpperCase(),
      })
      .getOne();
    if (duplicate && duplicate.id !== exceptId)
      throw new ConflictException('机构编码已存在');
  }

  private async assertUnused(
    manager: EntityManager,
    id: string,
    includeStructure: boolean,
  ): Promise<void> {
    // 保守限制：有业务的机构不能改挂/换币种/停用，历史归属与结算口径保持稳定。
    const tables = [
      'yards',
      'customers',
      'carriers',
      'orders',
      'waybills',
      'inbound_batches',
      'finance_records',
      'transport_orders',
      'transport_trips',
      'transport_lines',
      'transport_tariffs',
      'transport_charges',
      'transport_events',
      'transport_exceptions',
      'yard_state_events',
      'yard_slot_state_events',
      'order_vin_state_events',
      'daily_snapshot_runs',
    ];
    for (const table of tables) {
      const rows: unknown[] = await manager.query(
        `SELECT 1 FROM "${table}" WHERE organization_id = $1 LIMIT 1`,
        [id],
      );
      if (rows.length)
        throw new ConflictException(
          '机构已有场地、合作方、业务或历史数据，不能停用、修改上级、币种或运营日历',
        );
    }
    if (includeStructure) {
      const [children, members] = await Promise.all([
        manager.countBy(Organization, { parentId: id }),
        manager.query<unknown[]>(
          'SELECT 1 FROM user_organization_memberships WHERE organization_id = $1 LIMIT 1',
          [id],
        ),
      ]);
      if (children || members.length)
        throw new ConflictException(
          '机构存在子机构或成员，请先处理后再停用或修改上级',
        );
    }
  }

  // 供 seed 使用的低层创建，不做 scope 校验
  createUnscoped(data: Partial<Organization>): Promise<Organization> {
    return this.organizationsRepository.save(
      this.organizationsRepository.create(data),
    );
  }

  findByCode(code: string): Promise<Organization | null> {
    return this.organizationsRepository.findOne({ where: { code } });
  }

  findAllUnscoped(): Promise<Organization[]> {
    return this.organizationsRepository.find({ order: { name: 'ASC' } });
  }

  async updateOperatingPolicy(
    organizationId: string,
    dto: UpdateOperatingPolicyDto,
    scope: EffectiveScope,
  ): Promise<OrganizationOperatingPolicy> {
    await this.assertManaged(organizationId, scope);
    this.assertTimezone(dto.timezone);
    return this.dataSource.transaction(async (manager) => {
      await this.lockMaintenance(manager);
      const current = await manager.findOne(OrganizationOperatingPolicy, {
        where: { organizationId },
      });
      if (!current) throw new NotFoundException('机构运营策略不存在');
      const calendarChanged =
        (dto.timezone !== undefined && dto.timezone !== current.timezone) ||
        (dto.businessDayCutoff !== undefined &&
          (dto.businessDayCutoff.length === 5
            ? `${dto.businessDayCutoff}:00`
            : dto.businessDayCutoff) !== current.businessDayCutoff);
      if (calendarChanged) {
        const runs: unknown[] = await manager.query(
          'SELECT 1 FROM daily_snapshot_runs WHERE organization_id = $1 LIMIT 1',
          [organizationId],
        );
        if (runs.length)
          throw new ConflictException(
            '机构已生成历史快照，不能直接修改时区或业务日切',
          );
        await this.assertUnused(manager, organizationId, false);
      }
      const warning =
        dto.utilizationWarningPercent ??
        Number(current.utilizationWarningPercent);
      const critical =
        dto.utilizationCriticalPercent ??
        Number(current.utilizationCriticalPercent);
      if (warning >= critical) {
        throw new BadRequestException('利用率警告阈值必须小于严重阈值');
      }
      Object.assign(current, dto, { updatedAt: new Date() });
      return manager.save(current);
    });
  }

  private assertTimezone(timezone?: string): void {
    if (!timezone) return;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone 必须是有效的 IANA 时区');
    }
  }
}
