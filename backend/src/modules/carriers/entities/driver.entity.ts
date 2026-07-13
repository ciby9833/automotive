import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Carrier } from './carrier.entity';

// 司机信息；自营车场景下补充银行账户用于运输前自动发放差旅费
@Entity('drivers')
export class Driver extends BaseEntity {
  @ManyToOne(() => Carrier, (carrier) => carrier.drivers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'carrier_id' })
  carrier: Carrier;

  @Column({ name: 'carrier_id' })
  carrierId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  licenseNo: string;

  // 仅自营车（CarrierType.SELF_OWNED）司机需要维护，用于自动打款
  @Column({ nullable: true })
  bankAccountName: string;

  @Column({ nullable: true })
  bankAccountNo: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ default: true })
  isActive: boolean;
}
