import { Column, Entity, OneToMany } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import { YardSlot } from './yard-slot.entity';

// 场地是可配置实体，不写死"场地A/场地B"，新增场地无需改代码
// 场地归属机构（总部--机构--仓库），场地本身不再决定币种，币种取机构的 defaultCurrency
@Entity('yards')
export class Yard extends OrgScopedEntity {
  @Column({ unique: true })
  code: string; // 场地编码，如 YARD_A

  @Column()
  name: string; // 场地名称，如 场地A

  @Column({ nullable: true })
  address: string;

  // 预留地理围栏坐标，供后续地图/GPS功能使用，P0阶段可为空
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => YardSlot, (slot) => slot.yard)
  slots: YardSlot[];
}
