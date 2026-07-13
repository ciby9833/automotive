import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import {
  TransportType,
  VehicleTowType,
} from '../../../common/enums/order-type.enum';
import { WaybillStatus } from '../../../common/enums/waybill-status.enum';
import { Order } from '../../orders/entities/order.entity';
import { Carrier } from '../../carriers/entities/carrier.entity';
import { Driver } from '../../carriers/entities/driver.entity';
import { Vehicle } from '../../carriers/entities/vehicle.entity';
import { Yard } from '../../yards/entities/yard.entity';
import { CustomerAddress } from '../../customers/entities/customer-address.entity';
import { WaybillVin } from './waybill-vin.entity';

// 运单是系统状态机的核心：未到达 -> 运输中 -> 已到达（到达后锁定）
// 状态流转规则不在这里写死判断逻辑，统一由 waybills.service 里的状态机方法处理，
// 避免订单/扫码/财务模块各自实现一套判断导致后期返工
// organizationId 冗余存储（同订单一致），供机构维度权限过滤使用
@Entity('waybills')
export class Waybill extends OrgScopedEntity {
  @Column({ unique: true })
  waybillCode: string; // 系统自动生成

  @Column({ nullable: true })
  customerWaybillCode: string; // 客户运单号，手动录入

  @Column({ type: 'enum', enum: TransportType })
  transportType: TransportType;

  // 直接开单时可不关联订单
  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Yard, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'origin_yard_id' })
  originYard: Yard | null;

  @Column({ name: 'origin_yard_id', type: 'uuid', nullable: true })
  originYardId: string | null;

  @Column({ nullable: true })
  originText: string; // 港口等非场地始发点

  @ManyToOne(() => Yard, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_yard_id' })
  destinationYard: Yard | null;

  @Column({ name: 'destination_yard_id', type: 'uuid', nullable: true })
  destinationYardId: string | null;

  @ManyToOne(() => CustomerAddress, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_dealer_id' })
  destinationDealer: CustomerAddress | null;

  @Column({ name: 'destination_dealer_id', type: 'uuid', nullable: true })
  destinationDealerId: string | null;

  @ManyToOne(() => Carrier, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'carrier_id' })
  carrier: Carrier | null;

  @Column({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId: string | null;

  @ManyToOne(() => Driver, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver | null;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @ManyToOne(() => Vehicle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId: string | null;

  @Column({ type: 'enum', enum: VehicleTowType, nullable: true })
  towType: VehicleTowType | null;

  @Column({
    type: 'enum',
    enum: WaybillStatus,
    default: WaybillStatus.NOT_ARRIVED,
  })
  status: WaybillStatus;

  // 已到达后锁定，运输数据不可再编辑（一个VIN多次调拨时，前一次到达后即锁定）
  @Column({ default: false })
  isLocked: boolean;

  // 自营车运单在启运前需完成差旅费打款
  @Column({ default: false })
  travelExpensePaid: boolean;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @OneToMany(() => WaybillVin, (v) => v.waybill)
  vins: WaybillVin[];
}
