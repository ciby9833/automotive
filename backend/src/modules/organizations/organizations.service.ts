import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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
    @InjectRepository(OrganizationOperatingPolicy)
    private readonly policiesRepository: Repository<OrganizationOperatingPolicy>,
    private readonly scopeService: ScopeService,
  ) {}

  // 内部账号只能看到自己 scope 下的机构树；外部账号只看到自己所属的一个节点（供 UI 展示"你属于哪家机构"用）
  async findAll(scope: EffectiveScope): Promise<Organization[]> {
    if (scope.type === 'ORG') {
      return this.organizationsRepository.find({
        where: { id: In(scope.orgIds) },
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
    if (scope.type !== 'ORG') {
      throw new BadRequestException('外部账号无权创建机构');
    }
    if (!dto.parentId) {
      throw new BadRequestException(
        '必须指定 parentId；根节点(HQ)由系统初始化，不可通过接口创建',
      );
    }
    this.scopeService.assertOrgWritable(scope, dto.parentId);
    const dupCode = await this.organizationsRepository.findOne({
      where: { code: dto.code },
    });
    if (dupCode) throw new ConflictException('机构编码已存在');
    this.assertTimezone(dto.timezone);
    const parentPolicy = await this.policiesRepository.findOne({
      where: { organizationId: dto.parentId },
    });
    if (!parentPolicy) {
      throw new BadRequestException('父机构尚未配置运营日历');
    }
    const organization = await this.organizationsRepository.save(
      this.organizationsRepository.create({
        code: dto.code,
        name: dto.name,
        defaultCurrency: dto.defaultCurrency,
        parentId: dto.parentId,
      }),
    );
    await this.policiesRepository.save(
      this.policiesRepository.create({
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
    return this.findOne(organization.id);
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
    this.scopeService.assertOrgWritable(scope, organizationId);
    this.assertTimezone(dto.timezone);
    const current = await this.policiesRepository.findOne({
      where: { organizationId },
    });
    if (!current) throw new NotFoundException('机构运营策略不存在');
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
    return this.policiesRepository.save(current);
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
