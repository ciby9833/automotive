import { Column, Entity, OneToMany } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import { CarrierType } from '../../../common/enums/carrier-type.enum';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';

// 供应商/承运商：外部供应商与自营车（未来内部司机）共用同一实体，
// 用 type 区分，新增内部车队时不需要重建数据结构
// 供应商归属单一机构（同一集团在不同机构的供应商视为不同记录）
@Entity('carriers')
export class Carrier extends OrgScopedEntity {
  @Column()
  name: string; // 全称，如 "PT. KMDI Logistics"

  // 简称/代号，如 "KMDI"、"IPP"。BYD Excel 里通常只写简称，
  // 系统里做订单分配时按简称对照即可。
  @Column({ name: 'short_name', type: 'varchar', nullable: true })
  shortName: string | null;

  @Column({ type: 'enum', enum: CarrierType, default: CarrierType.EXTERNAL })
  type: CarrierType;

  @Column({ nullable: true })
  contactName: string;

  @Column({ nullable: true })
  contactPhone: string;

  // 用于接收运单分配通知/对账单等系统邮件
  @Column({ nullable: true })
  email: string;

  // 报价说明/备注，正式报价规则(始发+目的+拖车类型+件数)在阶段1的运单/财务模块中按路由维护
  @Column({ type: 'text', nullable: true })
  quotationNote: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Driver, (driver) => driver.carrier)
  drivers: Driver[];

  @OneToMany(() => Vehicle, (vehicle) => vehicle.carrier)
  vehicles: Vehicle[];
}
