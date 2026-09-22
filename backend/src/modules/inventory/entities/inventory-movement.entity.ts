import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
export type MovementKind =
  | 'OPENING'
  | 'INBOUND'
  | 'MOVE'
  | 'LOAD'
  | 'UNLOAD'
  | 'DEPARTURE'
  | 'UNDO_INBOUND'
  | 'ADJUST_IN'
  | 'ADJUST_OUT';

// Immutable stock facts, not notification/application logs. Written in the stock transaction.
@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'inventory_id', type: 'uuid' }) inventoryId: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId: string;
  @Column({ name: 'yard_id', type: 'uuid' }) yardId: string;
  @Column() vin: string;
  @Column({ type: 'varchar' }) kind: MovementKind;
  @Column({ type: 'int' }) delta: number;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt: Date;
  @Column({ name: 'operator_user_id', type: 'uuid', nullable: true })
  operatorUserId: string | null;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ name: 'reference', type: 'text', nullable: true }) reference:
    string | null;
  @Column({ name: 'waybill_id', type: 'uuid', nullable: true }) waybillId:
    string | null;
  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;
  @Column({ name: 'after_state', type: 'jsonb' }) afterState: Record<
    string,
    unknown
  >;
}
