import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Waybill } from './waybill.entity';

@Entity('waybill_vins')
@Index(['vin'])
export class WaybillVin extends BaseEntity {
  @ManyToOne(() => Waybill, (waybill) => waybill.vins, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: Waybill;

  @Column({ name: 'waybill_id' })
  waybillId: string;

  @Column()
  vin: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  vehicleType: string;

  @Column({ default: false })
  isSigned: boolean; // 派送业务签收状态
}
