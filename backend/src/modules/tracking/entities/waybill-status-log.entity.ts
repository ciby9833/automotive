import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ScanAction } from '../../../common/enums/waybill-status.enum';
import { Waybill } from '../../waybills/entities/waybill.entity';
import { Yard } from '../../yards/entities/yard.entity';
import { User } from '../../users/entities/user.entity';

// 车架号全生命周期审计日志：入库/调拨/出库/扫码记录/操作日志的唯一数据来源，
// 轨迹跟踪、场地库位变更记录、移动端扫码都往这张表里追加记录，不另起炉灶
@Entity('waybill_status_logs')
@Index(['vin'])
export class WaybillStatusLog extends BaseEntity {
  @ManyToOne(() => Waybill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: Waybill;

  @Column({ name: 'waybill_id' })
  waybillId: string;

  @Column()
  vin: string;

  @Column({ type: 'enum', enum: ScanAction })
  action: ScanAction;

  @ManyToOne(() => Yard, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'yard_id' })
  yard: Yard | null;

  @Column({ name: 'yard_id', type: 'uuid', nullable: true })
  yardId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operator_user_id' })
  operator: User | null;

  @Column({ name: 'operator_user_id', type: 'uuid', nullable: true })
  operatorUserId: string | null;

  // 电量/里程/外观情况等车辆检查记录，或签收/启运凭证说明
  @Column({ type: 'jsonb', nullable: true })
  vehicleCheckInfo: Record<string, unknown> | null;

  // 交付凭证(SJ照片)、外观图片等附件URL，来自 storage 模块上传结果
  @Column({ type: 'text', array: true, nullable: true })
  attachmentUrls: string[] | null;

  @Column({ type: 'text', nullable: true })
  remark: string;
}
