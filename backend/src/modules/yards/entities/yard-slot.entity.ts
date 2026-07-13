import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Yard } from './yard.entity';

export enum YardSlotStatus {
  VACANT = 'VACANT', // 空闲车位
  OCCUPIED = 'OCCUPIED', // 已占用车位
}

@Entity('yard_slots')
@Index(['yard', 'code'], { unique: true })
export class YardSlot extends BaseEntity {
  @ManyToOne(() => Yard, (yard) => yard.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'yard_id' })
  yard: Yard;

  @Column({ name: 'yard_id' })
  yardId: string;

  @Column()
  code: string; // 库位编码，如 A-01

  @Column({ nullable: true })
  row: string;

  @Column({ nullable: true })
  slotNo: string;

  @Column({
    type: 'enum',
    enum: YardSlotStatus,
    default: YardSlotStatus.VACANT,
  })
  status: YardSlotStatus;

  // 当前占用车辆的VIN，占用时必填；VIN 库存查询按此字段做主表
  @Column({ type: 'varchar', nullable: true })
  currentVin: string | null;

  // 占用时间戳；用于计算"停放天数"(超龄库存指标)。release 时清空。
  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  // 是否被业务锁定(如客户扣留、司法查封)；日常运营看板可显示，避免误操作
  @Column({ default: false })
  isLocked: boolean;
}
