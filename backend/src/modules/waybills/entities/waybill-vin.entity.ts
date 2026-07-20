import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Waybill } from './waybill.entity';

@Entity('waybill_vins')
@Index(['vin'])
export class WaybillVin extends BaseEntity {
  @ManyToOne(() => Waybill, (waybill) => waybill.vins, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: Waybill;

  @Column({ name: 'waybill_id' })
  waybillId: string;

  @Column()
  vin: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  vehicleType: string;

  @Column({ default: false })
  isSigned: boolean; // 派送业务签收状态

  // 装车事件：始发场地作业员扫这台 VIN 上车时打点。
  // 全部 loadedAt 都非空后，才允许 waybill 整单启运 (POST /waybills/:id/depart)
  @Column({ name: 'loaded_at', type: 'timestamptz', nullable: true })
  loadedAt: Date | null;

  // 单台车的装车凭证：装车照 + 可选损伤复检照，与整单闸口合影分开存
  @Column({ name: 'load_photo_keys', type: 'text', array: true, default: () => "'{}'::text[]" })
  loadPhotoKeys: string[];
}
