import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OperationType } from '../../../common/enums/operation-type.enum';
import { User } from '../../users/entities/user.entity';

// 通用业务操作审计流水。
// 与 waybill_status_logs 分工：waybill scan 事件 (启运/装车/到达等) 走 WaybillStatusLog 以复用 attachment/vehicleCheckInfo 字段；
// 其余业务节点（订单导入、取消、提货、入库、场地移位等）走这张表。
// 轨迹跟踪页按 vin/orderId 合并两张表按时间排序。
@Entity('operation_logs')
@Index(['vin'])
@Index(['orderId'])
export class OperationLog extends BaseEntity {
  @Column({ name: 'operation_type', type: 'enum', enum: OperationType })
  operationType: OperationType;

  // 相关订单 (入库单、出库单皆可)。方便按订单聚合时间线
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  // 相关 VIN（可选）。VIN 层动作 (取消/编辑/提货/入库/移位) 必填；订单层动作 (导入/取消整单) 可空
  @Column({ type: 'varchar', nullable: true })
  vin: string | null;

  // 结构化载荷：不同 operationType 保存不同上下文
  // 例如：INBOUND_ORDER_CANCEL 存 { vinCount, orderCode }；VIN_EDIT 存 { before, after }；YARD_MOVE 存 { fromSlot, toSlot }
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'operator_user_id' })
  operator: User | null;

  @Column({ name: 'operator_user_id', type: 'uuid', nullable: true })
  operatorUserId: string | null;
}
