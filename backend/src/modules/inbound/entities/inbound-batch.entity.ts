import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import { Yard } from '../../yards/entities/yard.entity';
import { User } from '../../users/entities/user.entity';
import { OrderVin } from '../../orders/entities/order-vin.entity';

// 入库批次：把"到货同一批次的车"聚在一起。
// 场景：一辆卡车从港口拉了 20 台 BYD 过来，业务员先建一个批次 "BATCH-20260710-01"，
// 然后扫这 20 台的 VIN。每台 OrderVin.inboundBatchId 指向这个批次。
// 一个批次可以跨订单(卡车拉了多张订单的车)；一个订单也可能分多个批次到货。
@Entity('inbound_batches')
export class InboundBatch extends OrgScopedEntity {
  @ManyToOne(() => Yard, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'yard_id' })
  yard: Yard;

  @Column({ name: 'yard_id', type: 'uuid' })
  yardId: string;

  @Column({ name: 'batch_code', unique: true })
  batchCode: string; // 人可读标签，如 "BATCH-20260710-01"，同一 org 内唯一

  @Column({ name: 'arrived_date', type: 'date' })
  arrivedDate: string; // 到货日期(YYYY-MM-DD)

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @OneToMany(() => OrderVin, (v) => v.inboundBatch)
  vins: OrderVin[];
}
