import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Organization } from './organization.entity';

/**
 * 机构运营日历与看板规则。
 * 所有会影响业务日期和预警判断的参数均存储为数据，服务层不按国家代码写分支。
 */
@Entity('organization_operating_policies')
export class OrganizationOperatingPolicy {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar' })
  timezone: string;

  @Column({ name: 'business_day_cutoff', type: 'time' })
  businessDayCutoff: string;

  @Column({ name: 'snapshot_enabled', default: true })
  snapshotEnabled: boolean;

  @Column({ name: 'snapshot_started_at', type: 'timestamptz' })
  snapshotStartedAt: Date;

  @Column({ name: 'long_stay_days', type: 'int' })
  longStayDays: number;

  @Column({ name: 'lock_timeout_hours', type: 'int' })
  lockTimeoutHours: number;

  @Column({ name: 'utilization_warning_percent', type: 'numeric' })
  utilizationWarningPercent: number;

  @Column({ name: 'utilization_critical_percent', type: 'numeric' })
  utilizationCriticalPercent: number;

  @Column({ name: 'expected_arrival_warning_hours', type: 'int' })
  expectedArrivalWarningHours: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
