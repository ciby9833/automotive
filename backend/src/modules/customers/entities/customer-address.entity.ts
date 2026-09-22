import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Customer } from './customer.entity';

// 客户地址簿：派送业务的最终收货地址（如经销商），供创建开单时选择目的地
@Entity('customer_addresses')
export class CustomerAddress extends BaseEntity {
  @ManyToOne(() => Customer, (customer) => customer.addresses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'customer_id' })
  customerId: string;

  // BYD 集团层级：一个 dealerGroup 下有多家 branch (如 Arista → 苏门答腊/雅加达/深圳)
  @Column({ name: 'dealer_group', type: 'varchar', nullable: true })
  dealerGroup: string | null;

  @Column()
  dealerName: string; // 相当于 BYD Excel 里的 Branch BYD

  @Column()
  address: string; // 相当于 BYD Excel 里的 Alamat

  // 客户系统内的门店代码（Z2410265332 类）；客户内唯一，是出库目的门店的业务键。
  // nullable 仅用于保留被历史运单引用的冻结旧记录；所有新写入均由 API + DB 约束强制必填。
  @Column({ type: 'varchar', nullable: true })
  code: string | null;

  // 地理大区 (GREATER JAKARTA / SUMATERA 等)，用于开单时按区聚合
  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ nullable: true })
  contactName: string;

  @Column({ nullable: true })
  contactPhone: string;

  @Column({ default: true })
  isActive: boolean;

  // 地点类型：STORE 门店（派送目的地/应收计价维度）、FACTORY 工厂、YARD 客户场地/RDC。
  // 纯运输的起点、终点都只能从该客户自己的地点里选。老的出库流程只匹配 STORE。
  @Column({ type: 'varchar', default: 'STORE' })
  kind: CustomerAddressKind;
}

export const CUSTOMER_ADDRESS_KINDS = ['STORE', 'FACTORY', 'YARD'] as const;
export type CustomerAddressKind = (typeof CUSTOMER_ADDRESS_KINDS)[number];
