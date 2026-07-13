import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from './user.entity';

// 内部账号 -> Organization 节点的多对多关系；同一用户在不同 org 允许不同 role（飞书式多组织）。
// 外部账号(CARRIER_*/CUSTOMER) 不使用此表——他们通过 User.carrierId/customerId 直接挂在业务实体下。
// (userId, organizationId) 唯一：一个用户在同一 org 只有一条 membership（换个角色就 update，不 append）。
// role 存这里而不是 User 表，是因为同一账号跨机构可以担任不同职务(比如印尼是 ORG_ADMIN、马来是 YARD_STAFF)。
@Entity('user_organization_memberships')
@Unique(['userId', 'organizationId'])
export class UserOrganizationMembership extends BaseEntity {
  @ManyToOne(() => User, (u) => u.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Index()
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  // 这里的 role 允许 HQ_ADMIN / ORG_ADMIN / YARD_STAFF，外部三类角色不允许入 membership 表
  @Column({ type: 'enum', enum: Role })
  role: Role;
}
