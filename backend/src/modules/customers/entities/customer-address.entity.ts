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

  // 客户系统内的门店代码（Z2410265332 类）；导入时用于去重键
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
}
