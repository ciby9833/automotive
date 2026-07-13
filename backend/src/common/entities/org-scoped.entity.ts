import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from '../../modules/organizations/entities/organization.entity';

// 所有业务实体必须继承此基类，强制带上 organizationId + Organization 外键，
// 避免各模块自己定义结构不一致或漏掉机构维度，从架构层堵住"新增功能忘记关联机构"这类问题。
// 权限过滤统一走 common/scope/scope.service.ts 的 ScopeService.applyScopeToQuery，不允许模块自建过滤逻辑。
export abstract class OrgScopedEntity extends BaseEntity {
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Index()
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;
}
