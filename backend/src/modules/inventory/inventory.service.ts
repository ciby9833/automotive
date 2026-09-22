import { formatSlotCode } from '../yards/slot-code.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { YardInventory } from './entities/yard-inventory.entity';
import {
  InventoryMovement,
  MovementKind,
} from './entities/inventory-movement.entity';
import { YardSlot, YardSlotStatus } from '../yards/entities/yard-slot.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { Order } from '../orders/entities/order.entity';
import { Yard } from '../yards/entities/yard.entity';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';

type Context = {
  userId: string;
  reason?: string;
  reference?: string;
  waybillId?: string;
};
@Injectable()
export class InventoryService {
  constructor(private readonly audit: AuditService) {}

  // All stock operations acquire this VIN lock before slot locks.
  async lockVin(mgr: EntityManager, vin: string) {
    await mgr.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `yard-inventory:${vin}`,
    ]);
  }

  async active(mgr: EntityManager, vin: string): Promise<YardInventory> {
    await this.lockVin(mgr, vin);
    const stock = await mgr.findOne(YardInventory, {
      where: { vin, closedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stock) throw new BadRequestException('车辆不在场，不能执行此库存操作');
    return stock;
  }

  async slot(mgr: EntityManager, id: string, yardId: string, vacant = true) {
    const slot = await mgr
      .getRepository(YardSlot)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.zone', 'z')
      .innerJoinAndSelect('s.yard', 'y')
      .where('s.id = :id AND s.yardId = :yardId', { id, yardId })
      .setLock('pessimistic_write', undefined, ['s', 'z', 'y'])
      .getOne();
    if (!slot || !slot.yard.isActive || !slot.zone.isActive || slot.isLocked)
      throw new BadRequestException('库位不存在、已停用或已冻结');
    if (vacant && slot.status !== YardSlotStatus.VACANT)
      throw new BadRequestException('目标库位已占用');
    return slot;
  }

  private async snapshot(
    mgr: EntityManager,
    stock: YardInventory,
    vin: OrderVin,
  ): Promise<Record<string, unknown>> {
    const slot = stock.slotId
      ? await mgr.findOne(YardSlot, {
          where: { id: stock.slotId },
          relations: { zone: true },
        })
      : null;
    return JSON.parse(
      JSON.stringify({
        ...stock,
        slotCode: slot
          ? formatSlotCode(slot.zone.code, slot.line, slot.row)
          : null,
        vehicle: {
          orderId: vin.orderId,
          arrivalStatus: vin.arrivalStatus,
          arrivedAt: vin.arrivedAt,
          arrivedByUserId: vin.arrivedByUserId,
          slotId: vin.slotId,
          inboundBatchId: vin.inboundBatchId,
          arrivalPhotoUrls: vin.arrivalPhotoUrls,
          vehicleCheckInfo: vin.vehicleCheckInfo,
          arrivalRemark: vin.arrivalRemark,
          model: vin.model,
          color: vin.color,
          brand: vin.brand,
          vehicleType: vin.vehicleType,
        },
      }),
    );
  }

  private async record(
    mgr: EntityManager,
    stock: YardInventory,
    vin: OrderVin,
    before: Record<string, unknown> | null,
    kind: MovementKind,
    context: Context,
  ) {
    if (!mgr.queryRunner?.isTransactionActive)
      throw new Error('Inventory requires a transaction');
    const delta = ['INBOUND', 'ADJUST_IN'].includes(kind)
      ? 1
      : ['DEPARTURE', 'UNDO_INBOUND', 'ADJUST_OUT'].includes(kind)
        ? -1
        : 0;
    await mgr.save(stock);
    const after = await this.snapshot(mgr, stock, vin);
    await mgr.save(
      InventoryMovement,
      mgr.create(InventoryMovement, {
        inventoryId: stock.id,
        organizationId: stock.organizationId,
        yardId: stock.yardId,
        vin: stock.vin,
        kind,
        delta,
        occurredAt: new Date(),
        operatorUserId: context.userId,
        reason: context.reason?.trim() || null,
        reference: context.reference?.trim() || null,
        waybillId: context.waybillId ?? null,
        beforeState: before,
        afterState: after,
      }),
    );
    // Preserve the existing VIN timeline, in the same transaction as the authoritative ledger.
    await this.audit.log(
      {
        operationType: {
          OPENING: OperationType.INVENTORY_ADJUST,
          INBOUND: OperationType.INBOUND_SCAN,
          MOVE: OperationType.YARD_MOVE,
          LOAD: OperationType.INVENTORY_STATUS,
          UNLOAD: OperationType.INVENTORY_STATUS,
          DEPARTURE: OperationType.INVENTORY_STATUS,
          UNDO_INBOUND: OperationType.INBOUND_UNDO,
          ADJUST_IN: OperationType.INVENTORY_ADJUST,
          ADJUST_OUT: OperationType.INVENTORY_ADJUST,
        }[kind],
        orderId: vin.orderId,
        vin: vin.vin,
        yardId: stock.yardId,
        slotId: stock.slotId,
        operatorUserId: context.userId,
        waybillId: context.waybillId,
        attachmentUrls:
          kind === 'INBOUND' || kind === 'ADJUST_IN'
            ? vin.arrivalPhotoUrls
            : undefined,
        payload: {
          movementKind: kind,
          reason: context.reason,
          reference: context.reference,
          before,
          after,
        },
      },
      mgr,
    );
  }

  async receive(
    mgr: EntityManager,
    vin: OrderVin,
    slot: YardSlot,
    context: Context,
    kind: 'INBOUND' | 'ADJUST_IN' = 'INBOUND',
  ) {
    await this.lockVin(mgr, vin.vin);
    if (await mgr.existsBy(YardInventory, { vin: vin.vin, closedAt: IsNull() }))
      throw new BadRequestException('此 VIN 已在场');
    const order = await mgr.findOneByOrFail(Order, { id: vin.orderId });
    const yard = await mgr.findOneByOrFail(Yard, { id: slot.yardId });
    if (
      !yard.isActive ||
      yard.organizationId !== order.organizationId ||
      order.destinationYardId !== yard.id
    )
      throw new BadRequestException('入库订单与场地不匹配或场地已停用');
    const stock = mgr.create(YardInventory, {
      organizationId: order.organizationId,
      yardId: slot.yardId,
      orderVinId: vin.id,
      vin: vin.vin,
      enteredAt: vin.arrivedAt!,
      position: slot.zone.purpose,
      slotId: slot.id,
      lastSlotId: slot.id,
      closedAt: null,
    });
    await this.record(mgr, stock, vin, null, kind, context);
    return stock;
  }

  private async clearSlot(mgr: EntityManager, stock: YardInventory) {
    if (!stock.slotId) return;
    const slot = await mgr.findOne(YardSlot, {
      where: { id: stock.slotId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !slot ||
      slot.currentVin !== stock.vin ||
      slot.status !== YardSlotStatus.OCCUPIED
    )
      throw new BadRequestException('车辆与库位关联不一致，请先核实库存');
    slot.status = YardSlotStatus.VACANT;
    slot.currentVin = null;
    slot.assignedAt = null;
    await mgr.save(slot);
  }

  async move(
    mgr: EntityManager,
    stock: YardInventory,
    targetId: string,
    context: Context,
    unload = false,
  ) {
    if (stock.position === 'LOADED' && !unload)
      throw new BadRequestException('已装车车辆请先撤销装车');
    if (stock.slotId === targetId)
      throw new BadRequestException('车辆已在目标库位');
    const vin = await mgr.findOneOrFail(OrderVin, {
      where: { id: stock.orderVinId },
      lock: { mode: 'pessimistic_write' },
    });
    const before = await this.snapshot(mgr, stock, vin);
    // Stable lock order prevents opposing moves from deadlocking.
    const ids = [stock.slotId, targetId]
      .filter((id): id is string => !!id)
      .sort();
    await mgr
      .getRepository(YardSlot)
      .createQueryBuilder('s')
      .where('s.id IN (:...ids)', { ids })
      .orderBy('s.id')
      .setLock('pessimistic_write')
      .getMany();
    const target = await this.slot(mgr, targetId, stock.yardId);
    await this.clearSlot(mgr, stock);
    target.status = YardSlotStatus.OCCUPIED;
    target.currentVin = stock.vin;
    target.assignedAt = stock.enteredAt;
    await mgr.save(target);
    stock.slotId = target.id;
    stock.lastSlotId = target.id;
    stock.position = target.zone.purpose;
    vin.slotId = target.id;
    await mgr.save(vin);
    await this.record(
      mgr,
      stock,
      vin,
      before,
      unload ? 'UNLOAD' : 'MOVE',
      context,
    );
  }

  async load(mgr: EntityManager, stock: YardInventory, context: Context) {
    if (stock.position === 'LOADED')
      throw new BadRequestException('车辆已装车');
    const vin = await mgr.findOneOrFail(OrderVin, {
      where: { id: stock.orderVinId },
      lock: { mode: 'pessimistic_write' },
    });
    const before = await this.snapshot(mgr, stock, vin);
    await this.clearSlot(mgr, stock);
    stock.lastSlotId = stock.slotId;
    stock.slotId = null;
    stock.position = 'LOADED';
    vin.slotId = null;
    await mgr.save(vin);
    await this.record(mgr, stock, vin, before, 'LOAD', context);
  }

  async close(
    mgr: EntityManager,
    stock: YardInventory,
    kind: 'DEPARTURE' | 'UNDO_INBOUND' | 'ADJUST_OUT',
    context: Context,
  ) {
    const vin = await mgr.findOneOrFail(OrderVin, {
      where: { id: stock.orderVinId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      kind !== 'DEPARTURE' &&
      (vin.isAllocated || vin.outboundOrderId || stock.position === 'LOADED')
    )
      throw new BadRequestException(
        '车辆已关联出库计划或装车，请先撤销相关出库业务',
      );
    if (kind === 'DEPARTURE' && stock.position !== 'LOADED')
      throw new BadRequestException('车辆尚未装车');
    if (kind !== 'DEPARTURE' && !context.reason?.trim())
      throw new BadRequestException('必须填写原因');
    const before = await this.snapshot(mgr, stock, vin);
    await this.clearSlot(mgr, stock);
    stock.slotId = null;
    stock.position = 'OFFSITE';
    stock.closedAt = new Date();
    vin.slotId = null;
    if (kind === 'UNDO_INBOUND') {
      vin.arrivalStatus = OrderVinArrivalStatus.EXPECTED;
      vin.arrivedAt = null;
      vin.arrivedByUserId = null;
      vin.inboundBatchId = null;
      vin.arrivalPhotoUrls = null;
      vin.vehicleCheckInfo = null;
      vin.arrivalRemark = null;
    }
    await mgr.save(vin);
    await this.record(mgr, stock, vin, before, kind, context);
  }
}
