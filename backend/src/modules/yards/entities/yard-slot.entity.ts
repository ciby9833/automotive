import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Yard } from './yard.entity';
import { YardZone } from './yard-zone.entity';

export enum YardSlotStatus {
  VACANT = 'VACANT',
  OCCUPIED = 'OCCUPIED',
}

// 3-level: Yard → Zone → Slot
// slot 只存 zone_id + line int + row int；显示编码由前端拼 `${zone.code}-${line:02}-${row:02}`
// 好处：zone 改名后所有 slot 的展示自动跟随，不用 UPDATE
@Entity('yard_slots')
@Index(['zone', 'line', 'row'], { unique: true })
export class YardSlot extends BaseEntity {
  @ManyToOne(() => Yard, (yard) => yard.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'yard_id' })
  yard: Yard;

  @Column({ name: 'yard_id' })
  yardId: string;

  @ManyToOne(() => YardZone, (zone) => zone.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zone_id' })
  zone: YardZone;

  @Column({ name: 'zone_id' })
  zoneId: string;

  // 排号（区内第几条通道，1-based）
  @Column({ type: 'integer' })
  line: number;

  // 位号（该排内第几位，1-based）
  @Column({ type: 'integer' })
  row: number;

  @Column({
    type: 'enum',
    enum: YardSlotStatus,
    default: YardSlotStatus.VACANT,
  })
  status: YardSlotStatus;

  @Column({ name: 'current_vin', type: 'varchar', nullable: true })
  currentVin: string | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;
}
