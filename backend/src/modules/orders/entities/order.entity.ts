import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import { TransportType } from '../../../common/enums/order-type.enum';
import { Customer } from '../../customers/entities/customer.entity';
import { Yard } from '../../yards/entities/yard.entity';
import { OrderVin } from './order-vin.entity';

// 订单来自客户(Excel 导入或未来系统对接)：入库订单(transportType=TRANSFER)、
// 出库订单(DELIVERY)、调拨订单(REALLOCATION) 共用同一实体，用 transportType 区分。
// organizationId 冗余存储客户所属机构，避免每次按机构过滤都要 join customers 表。
@Entity('orders')
export class Order extends OrgScopedEntity {
  @Column({ unique: true })
  orderCode: string;

  // 客户方内部单号 (BYD 系统里的引用号)。入库场景一份 Excel 常有；出库场景客户会给
  // 单独的运单号 (customerWaybillCode)。可空。
  @Column({ name: 'customer_order_no', type: 'varchar', nullable: true })
  customerOrderNo: string | null;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ type: 'enum', enum: TransportType })
  transportType: TransportType;

  // 港口/仓库(始发)、仓库/经销商(目的)。入库场景 originText 通常是港口/工厂名，
  // destinationYardId 是极兔仓库。出库场景反之。
  @Column({ nullable: true })
  originText: string;

  @Column({ nullable: true })
  destinationText: string;

  // 目的仓(入库场景必填、出库场景可为空——出库目的地是经销商)。
  @ManyToOne(() => Yard, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_yard_id' })
  destinationYard: Yard | null;

  @Column({ name: 'destination_yard_id', type: 'uuid', nullable: true })
  destinationYardId: string | null;

  // 预计到货日 (入库场景)，用来给场地安排接车。可空。
  @Column({ name: 'expected_arrival_date', type: 'date', nullable: true })
  expectedArrivalDate: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @OneToMany(() => OrderVin, (vin) => vin.order)
  vins: OrderVin[];
}
