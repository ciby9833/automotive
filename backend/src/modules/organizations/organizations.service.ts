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

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    private readonly scopeService: ScopeService,
  ) {}

  // 内部账号只能看到自己 scope 下的机构树；外部账号只看到自己所属的一个节点（供 UI 展示"你属于哪家机构"用）
  async findAll(scope: EffectiveScope): Promise<Organization[]> {
    if (scope.type === 'ORG') {
      return this.organizationsRepository.find({
        where: { id: In(scope.orgIds) },
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
    return this.organizationsRepository.save(
      this.organizationsRepository.create(dto),
    );
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
}
