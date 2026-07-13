import { Exclude } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { Carrier } from '../../carriers/entities/carrier.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Yard } from '../../yards/entities/yard.entity';
import { UserOrganizationMembership } from './user-organization-membership.entity';

// 账号分两类：
//  - 内部账号 (HQ_ADMIN / ORG_ADMIN / YARD_STAFF)：通过 UserOrganizationMembership 挂在 org 树某个/多个节点上，
//    支持在多机构切换。YARD_STAFF 另外通过 scopeYardId 限定到具体场地。
//  - 外部账号 (CARRIER_STAFF / CARRIER_DRIVER / CUSTOMER)：不进 org 树，直接通过 carrierId / customerId
//    挂在业务实体下，权限=只能看/操作自己所属实体的数据。外部账号通过 Invitation 邀请码自助注册产生。
// User 表本身不再有 organizationId 字段——避免"内部账号既在 membership 里又在 organizationId 里"两处不一致。
@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  username: string;

  @Exclude()
  @Column()
  passwordHash: string;

  @Column()
  displayName: string;

  // role 表示账号"类型"，用于登录后路由到不同流程；
  // 内部账号的实际权限还需要看 memberships 里的角色（同一 user 在不同 org 允许不同 role）。
  // 外部账号的 role 与 carrierId/customerId 必须一致（在 service 层保证）。
  @Column({ type: 'enum', enum: Role })
  role: Role;

  // YARD_STAFF 专属：绑定到具体场地
  @ManyToOne(() => Yard, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scope_yard_id' })
  scopeYard: Yard | null;

  @Index()
  @Column({ name: 'scope_yard_id', type: 'uuid', nullable: true })
  scopeYardId: string | null;

  // CARRIER_STAFF / CARRIER_DRIVER 专属：直接挂在承运商下
  @ManyToOne(() => Carrier, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'carrier_id' })
  carrier: Carrier | null;

  @Index()
  @Column({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId: string | null;

  // CUSTOMER 专属：直接挂在客户下
  @ManyToOne(() => Customer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Index()
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  email: string | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Exclude()
  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt: Date | null;

  // 预留字段，本期不做飞书绑定逻辑
  @Column({ type: 'varchar', nullable: true })
  feishuOpenId: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => UserOrganizationMembership, (m) => m.user)
  memberships: UserOrganizationMembership[];
}
