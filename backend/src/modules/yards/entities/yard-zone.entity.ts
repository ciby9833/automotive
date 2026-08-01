import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Yard } from './yard.entity';
import { YardSlot } from './yard-slot.entity';

// 一个 Zone = 场地里的一个"区"，容量 = line_count × row_count 车位
// slot.displayCode = `${zone.code}-${line:02}-${row:02}`（前端拼；zone 改名自动跟随）
@Entity('yard_zones')
@Index(['yardId', 'code'], { unique: true })
export class YardZone extends BaseEntity {
  @ManyToOne(() => Yard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'yard_id' })
  yard: Yard;

  @Column({ name: 'yard_id' })
  yardId: string;

  // 区编码：AB6 / D1 / C0 等；管理员自定义
  @Column()
  code: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  // 排数（每区几条通道）
  @Column({ name: 'line_count', type: 'integer', default: 0 })
  lineCount: number;

  // 每排位数（一排能停几台车）
  @Column({ name: 'row_count', type: 'integer', default: 0 })
  rowCount: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => YardSlot, (slot) => slot.zone)
  slots: YardSlot[];
}
