import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type InventoryPosition = 'PARKING' | 'STAGING' | 'LOADED' | 'OFFSITE';

// One row per stay. Loading changes position; only departure/adjustment closes a stay.
@Entity('yard_inventory')
@Index('UQ_inventory_active_vin', ['vin'], {
  unique: true,
  where: 'closed_at IS NULL',
})
@Index('UQ_inventory_active_slot', ['slotId'], {
  unique: true,
  where: 'closed_at IS NULL AND slot_id IS NOT NULL',
})
export class YardInventory extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId: string;
  @Column({ name: 'yard_id', type: 'uuid' }) yardId: string;
  @Column({ name: 'order_vin_id', type: 'uuid' }) orderVinId: string;
  @Column() vin: string;
  @Column({ name: 'entered_at', type: 'timestamptz' }) enteredAt: Date;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;
  @Column({ type: 'varchar' }) position: InventoryPosition;
  @Column({ name: 'slot_id', type: 'uuid', nullable: true }) slotId:
    string | null;
  @Column({ name: 'last_slot_id', type: 'uuid', nullable: true }) lastSlotId:
    string | null;
}
