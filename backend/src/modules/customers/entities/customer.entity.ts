import { Column, Entity, OneToMany } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import { CustomerAddress } from './customer-address.entity';

// 客户归属单一机构（同一集团在不同机构的客户视为不同记录，如 BYD Indonesia / BYD Malaysia）
@Entity('customers')
export class Customer extends OrgScopedEntity {
  @Column()
  name: string; // 如 BYD

  @Column({ nullable: true })
  contactName: string;

  @Column({ nullable: true })
  contactPhone: string;

  // 用于发送账单/对账确认等系统邮件
  @Column({ nullable: true })
  email: string;

  // 销售报价说明；具体按路由+拖车类型/件数的报价明细在阶段1财务模块中维护
  @Column({ type: 'text', nullable: true })
  quotationNote: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => CustomerAddress, (address) => address.customer)
  addresses: CustomerAddress[];
}
