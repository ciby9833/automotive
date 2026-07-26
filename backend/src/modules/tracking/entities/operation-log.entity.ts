import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OperationType } from '../../../common/enums/operation-type.enum';
import { User } from '../../users/entities/user.entity';
import { Yard } from '../../yards/entities/yard.entity';
import { YardSlot } from '../../yards/entities/yard-slot.entity';
import { Waybill } from '../../waybills/entities/waybill.entity';

// VIN 全生命周期节点表。
// 与 waybill_status_logs 并存：装车/启运/签收带电池/车况检查的扫码事件走 WaybillStatusLog，
// 其余节点（导入/取消/提货/入库/移位/开单/分派/…）走这张表。
// timeline 查询把两张表按 eventAt 合并归一，前端无需感知来源。
@Entity('operation_logs')
@Index(['vin'])
@Index(['orderId'])
export class OperationLog extends BaseEntity {
  @Column({ name: 'operation_type', type: 'enum', enum: OperationType })
  operationType: OperationType;

  // 业务发生时间。异步补录场景（离线扫码上传）与 createdAt 会分离
  @Column({ name: 'event_at', type: 'timestamptz', nullable: true })
  eventAt: Date | null;

  // 相关订单 (入库单、出库单皆可)。方便按订单聚合时间线
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  // 相关 VIN（可选）。VIN 层动作 (取消/编辑/提货/入库/移位) 必填；订单层汇总动作 (导入/取消整单) 可空
  @Column({ type: 'varchar', nullable: true })
  vin: string | null;

  @ManyToOne(() => Yard, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'yard_id' })
  yard: Yard | null;

  @Column({ name: 'yard_id', type: 'uuid', nullable: true })
  yardId: string | null;

  // 事件涉及的库位：移位类事件放"目标"库位，起始库位在 payload.fromSlotId
  @ManyToOne(() => YardSlot, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'slot_id' })
  slot: YardSlot | null;

  @Column({ name: 'slot_id', type: 'uuid', nullable: true })
  slotId: string | null;

  @ManyToOne(() => Waybill, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: Waybill | null;

  @Column({ name: 'waybill_id', type: 'uuid', nullable: true })
  waybillId: string | null;

  // 事件照片/凭证 URL。老代码把它埋在 payload.photoKeys 里，新代码统一写这里
  @Column({ name: 'attachment_urls', type: 'text', array: true, nullable: true })
  attachmentUrls: string[] | null;

  // 结构化载荷：不同 operationType 保存不同上下文
  // 例：INBOUND_ORDER_CANCEL={vinCount,orderCode}；YARD_MOVE={fromSlotId,fromSlotCode,toSlotId,toSlotCode}
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operator_user_id' })
  operator: User | null;

  @Column({ name: 'operator_user_id', type: 'uuid', nullable: true })
  operatorUserId: string | null;
}
