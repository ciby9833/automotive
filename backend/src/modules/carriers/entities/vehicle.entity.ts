import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { VehicleTowType } from '../../../common/enums/order-type.enum';
import { Carrier } from './carrier.entity';

// 承运商的拖车/运输车辆（车牌），非订单里的VIN车辆
@Entity('carrier_vehicles')
export class Vehicle extends BaseEntity {
  @ManyToOne(() => Carrier, (carrier) => carrier.vehicles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'carrier_id' })
  carrier: Carrier;

  @Column({ name: 'carrier_id' })
  carrierId: string;

  @Column()
  plateNumber: string;

  @Column({ type: 'enum', enum: VehicleTowType, nullable: true })
  towType: VehicleTowType | null;

  // 预留GPS实时定位坐标，供后续地图/轨迹功能使用
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  lastLocation: string | null;

  @Column({ default: true })
  isActive: boolean;
}
