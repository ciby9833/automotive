import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Currency } from '../../../common/enums/currency.enum';

// 总部/大区/国家统一为 Organization 树节点：HQ 作为根(parentId=null, code='HQ')，
// 国家/大区作为子节点(parentId=HQ.id)。权限子孙查询走 recursive CTE，
// 新增大区/国家只需插一条记录并指定 parentId，不动代码。
@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ unique: true })
  code: string; // HQ 用固定值 'HQ'；国家节点用 ISO 码，如 ID、MY、TH、VN、PH

  @Column()
  name: string;

  // 币种在 HQ 根节点通常无意义（HQ 本身不承接业务），保留但设置为默认 IDR 占位；
  // 业务实体真正取的是自身 organizationId 对应的国家节点币种。
  @Column({ type: 'enum', enum: Currency })
  defaultCurrency: Currency;

  // 自引用父节点：HQ 根节点为 null，其它节点必填。
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent: Organization | null;

  @Index()
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ default: true })
  isActive: boolean;
}
