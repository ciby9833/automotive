import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrderVinArrivalStatus } from '../../../common/enums/order-vin-status.enum';
import { VehicleTowType } from '../../../common/enums/order-type.enum';
import { Carrier } from '../../carriers/entities/carrier.entity';
import { User } from '../../users/entities/user.entity';
import { YardSlot } from '../../yards/entities/yard-slot.entity';
import { Order } from './order.entity';
import { InboundBatch } from '../../inbound/entities/inbound-batch.entity';

// 一辆车 = 一条 OrderVin。承载客户 Excel 里原始字段 + 提货流水 + 入库流水。
// 提货字段和入库字段都是可空的：
//   - 提货字段(pickup*)只在极兔实际派供应商去提的时候填(供应商司机 App 扫码填)
//   - 入库字段(arrival*)在到仓时填(场地业务员扫码填)
// 若 pickup 全空、arrival 已填 = 别家提货送来的三方直入
@Entity('order_vins')
@Index(['vin'])
@Index(['arrivalStatus'])
export class OrderVin extends BaseEntity {
  @ManyToOne(() => Order, (order) => order.vins, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  // ===== BYD Excel 原始信息 =====
  @Column()
  vin: string;

  @Column({ nullable: true })
  brand: string; // "BYD" 等

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  vehicleType: string;

  @Column({ name: 'motor_no', type: 'varchar', nullable: true })
  motorNo: string | null; // 发动机号，车损/纠纷时用来锁定车

  // ===== 提货 (供应商司机扫码时自动填) =====
  // pickupCarrierId 为空 = 我们没提货(可能是别家送来的三方直入)
  @ManyToOne(() => Carrier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickup_carrier_id' })
  pickupCarrier: Carrier | null;

  @Column({ name: 'pickup_carrier_id', type: 'uuid', nullable: true })
  pickupCarrierId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickup_driver_user_id' })
  pickupDriverUser: User | null;

  @Column({ name: 'pickup_driver_user_id', type: 'uuid', nullable: true })
  pickupDriverUserId: string | null;

  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt: Date | null;

  @Column({ name: 'pickup_location', type: 'varchar', nullable: true })
  pickupLocation: string | null; // 港口/工厂名称

  // 车损存证照片 (MinIO 里的 object key 列表)
  @Column({ name: 'pickup_photo_urls', type: 'text', array: true, nullable: true })
  pickupPhotoUrls: string[] | null;

  @Column({ name: 'pickup_remark', type: 'text', nullable: true })
  pickupRemark: string | null;

  // ===== 到仓入库 (场地业务员扫码时填) =====
  @Column({
    name: 'arrival_status',
    type: 'enum',
    enum: OrderVinArrivalStatus,
    default: OrderVinArrivalStatus.EXPECTED,
  })
  arrivalStatus: OrderVinArrivalStatus;

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'arrived_by_user_id' })
  arrivedByUser: User | null;

  @Column({ name: 'arrived_by_user_id', type: 'uuid', nullable: true })
  arrivedByUserId: string | null;

  @ManyToOne(() => YardSlot, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'slot_id' })
  slot: YardSlot | null;

  @Column({ name: 'slot_id', type: 'uuid', nullable: true })
  slotId: string | null;

  @ManyToOne(() => InboundBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inbound_batch_id' })
  inboundBatch: InboundBatch | null;

  @Column({ name: 'inbound_batch_id', type: 'uuid', nullable: true })
  inboundBatchId: string | null;

  // 到仓存证照片 (与 pickup_photo_urls 对称，责任转移到我们仓时的车况凭证)
  @Column({ name: 'arrival_photo_urls', type: 'text', array: true, nullable: true })
  arrivalPhotoUrls: string[] | null;

  // 车检信息：{ battery?: number, mileage?: number, exterior?: string, ... }
  // 用 jsonb 保留扩展性，未来加"轮胎/内饰"字段无需迁移
  @Column({ name: 'vehicle_check_info', type: 'jsonb', nullable: true })
  vehicleCheckInfo: Record<string, string | number> | null;

  @Column({ name: 'arrival_remark', type: 'text', nullable: true })
  arrivalRemark: string | null;

  // 软取消审计：单条 VIN 取消 (arrivalStatus=CANCELLED) 时记录操作人 + 时间
  // 整单取消也会走这条路径，一起打标记；数据永不硬删，供后续追溯
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancelled_by_user_id' })
  cancelledByUser: User | null;

  @Column({ name: 'cancelled_by_user_id', type: 'uuid', nullable: true })
  cancelledByUserId: string | null;

  // ===== 出库派送目的地 (客户 Excel 里每台车都可能不同) =====
  // dealerCode/dealerName 用文本存储：BYD 给的 Excel 只提供"经销店代码 + 名称"，
  // 不做外键到 customer_addresses —— 客户系统里的经销店维护是我们自己的事，先文本存证
  @Column({ name: 'dealer_code', type: 'varchar', nullable: true })
  dealerCode: string | null;

  @Column({ name: 'dealer_name', type: 'varchar', nullable: true })
  dealerName: string | null;

  // 客户要求的拖车类型：CC/TOWING/TANSYA。开单时按这个字段圈 VIN 到同一 Waybill
  @Column({
    name: 'tow_type',
    type: 'enum',
    enum: VehicleTowType,
    nullable: true,
  })
  towType: VehicleTowType | null;

  // BYD 内部分组编号 (如 CC1/CC2)，开单时用于同组 VIN 一起走
  @Column({ name: 'group_code', type: 'varchar', nullable: true })
  groupCode: string | null;

  // 出库单硬关联：客户 Excel 里指定的这批车所属的出库订单
  // 之前用 customerId + customerOrderNo 软关联，脆弱：出库单填 "123" 不会匹配到入库单 "ABC"
  // 现在直接指向 orders(id) FK；同一 VIN 可能属于多个入库单但只属一个当前 outbound
  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'outbound_order_id' })
  outboundOrder: Order | null;

  @Column({ name: 'outbound_order_id', type: 'uuid', nullable: true })
  outboundOrderId: string | null;

  // 是否已被某张出库运单选用(避免重复开单)
  @Column({ default: false })
  isAllocated: boolean;
}
