import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

@Entity('access_roles')
export class AccessRole extends BaseEntity {
  @Index()
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  // 固定数据范围类型，不是可编辑的岗位名称。
  @Column({ type: 'varchar' })
  type: Role;

  @Column({ type: 'text', array: true, default: () => "'{}'::text[]" })
  permissions: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
