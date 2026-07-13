import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { InvitationTargetType } from '../../../common/enums/invitation.enum';
import { Role } from '../../../common/enums/role.enum';
import { User } from '../../users/entities/user.entity';

// 外部账号(承运商员工/司机/客户)自助注册的凭证：内部人员创建 Carrier / Customer 后，
// 生成一次性 token 分享给外部人员，外部人员凭 token 注册产生一个 User 挂在对应实体下。
// token 用不可预测的高熵字符串；一旦被使用即失效（usedByUserId != null）。
@Entity('invitations')
export class Invitation extends BaseEntity {
  @Index({ unique: true })
  @Column()
  token: string;

  @Column({ type: 'enum', enum: InvitationTargetType })
  targetType: InvitationTargetType;

  // 指向 carriers.id 或 customers.id，具体由 targetType 决定；
  // 保留为普通 uuid 列而不建外键约束，避免每种业务实体表都要 CASCADE。
  // 业务侧删除 Carrier/Customer 时，Service 层负责清理相关 invitation。
  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  // 注册出来的账号会用这个 role（必须是外部三类角色之一：
  // CARRIER_STAFF / CARRIER_DRIVER / CUSTOMER）
  @Column({ type: 'enum', enum: Role })
  inviteeRole: Role;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'used_by_user_id' })
  usedByUser: User | null;

  @Column({ name: 'used_by_user_id', type: 'uuid', nullable: true })
  usedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;
}
