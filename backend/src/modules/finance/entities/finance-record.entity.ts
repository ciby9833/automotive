import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { OrgScopedEntity } from '../../../common/entities/org-scoped.entity';
import {
  FinanceRecordType,
  FinanceStatus,
} from '../../../common/enums/waybill-status.enum';
import { Currency } from '../../../common/enums/currency.enum';
import { Waybill } from '../../waybills/entities/waybill.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Carrier } from '../../carriers/entities/carrier.entity';

// 每张运单对应收入(客户)及成本(供应商)两条记录；自营车另有差旅费记录类型
// organizationId 冗余存储（同 waybill 一致），保持所有业务表都能直接按机构维度过滤，
// 不允许"经 waybill 关联查询"这种模块自建的例外做法
@Entity('finance_records')
export class FinanceRecord extends OrgScopedEntity {
  @ManyToOne(() => Waybill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill: Waybill;

  @Column({ name: 'waybill_id' })
  waybillId: string;

  @Column({ type: 'enum', enum: FinanceRecordType })
  type: FinanceRecordType;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Carrier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'carrier_id' })
  carrier: Carrier | null;

  @Column({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount: string;

  @Column({ type: 'enum', enum: Currency })
  currency: Currency;

  @Column({ type: 'enum', enum: FinanceStatus, default: FinanceStatus.PENDING })
  status: FinanceStatus;

  @Column({ nullable: true })
  invoiceRef: string;

  @Column({ type: 'text', nullable: true })
  remark: string;
}
