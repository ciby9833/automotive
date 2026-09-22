import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { AccessRole } from './access-role.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from './user.entity';

// 内部账号 -> Organization 节点的多对多关系；每条成员关系有独立数据范围和业务角色。
// 外部账号(CARRIER_*/CUSTOMER) 不使用此表——他们通过 User.carrierId/customerId 直接挂在业务实体下。
// (userId, organizationId) 唯一；role 仅表示固定数据范围类型，不代表拥有管理员的全部功能。
// 可配置岗位角色在 accessRoles 中多选，功能权限由当前成员关系的角色合并得出。
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

  @ManyToMany(() => AccessRole)
  @JoinTable({
    name: 'membership_access_roles',
    joinColumn: { name: 'membership_id' },
    inverseJoinColumn: { name: 'role_id' },
  })
  accessRoles: AccessRole[];

  @Column({ name: 'scope_yard_id', type: 'uuid', nullable: true })
  scopeYardId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
