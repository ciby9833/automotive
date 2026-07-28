import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Carrier } from '../../carriers/entities/carrier.entity';
import { Waybill } from '../../waybills/entities/waybill.entity';
import { Order } from '../../orders/entities/order.entity';

// 司机位置点：高频写入，migration 会在 TimescaleDB 可用时转换为 hypertable。
// 复合主键包含 captured_at，满足 Timescale 对 hypertable unique key 的限制。
@Entity('driver_positions')
@Index(['driverUserId', 'capturedAt'])
@Index(['carrierId', 'capturedAt'])
@Index(['waybillId', 'capturedAt'])
export class DriverPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @PrimaryColumn({ name: 'captured_at', type: 'timestamptz' })
  capturedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_user_id' })
  driverUser: User;

  @Column({ name: 'driver_user_id', type: 'uuid' })
  driverUserId: string;

  @ManyToOne(() => Carrier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'carrier_id' })
  carrier: Carrier | null;

  @Column({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId: string | null;

  @ManyToOne(() => Waybill, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: Waybill | null;

  @Column({ name: 'waybill_id', type: 'uuid', nullable: true })
  waybillId: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  vin: string | null;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ type: 'double precision', nullable: true })
  accuracy: number | null;

  @Column({ type: 'double precision', nullable: true })
  speed: number | null;

  @Column({ type: 'double precision', nullable: true })
  heading: number | null;

  @Column({ name: 'battery_level', type: 'double precision', nullable: true })
  batteryLevel: number | null;

  @Column({ name: 'is_charging', type: 'boolean', nullable: true })
  isCharging: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
