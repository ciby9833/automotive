import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { randomUUID } from 'crypto';
import { Waybill } from './entities/waybill.entity';
import { WaybillVin } from './entities/waybill-vin.entity';
import { OrderVin } from '../orders/entities/order-vin.entity';
import { YardSlot, YardSlotStatus } from '../yards/entities/yard-slot.entity';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { ScanDto } from './dto/scan.dto';
import { TransportType } from '../../common/enums/order-type.enum';
import {
  ScanAction,
  WaybillStatus,
} from '../../common/enums/waybill-status.enum';
import { TrackingService } from '../tracking/tracking.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { AuditService } from '../tracking/audit.service';
import { OperationType } from '../../common/enums/operation-type.enum';
import { QueueService } from '../queue/queue.service';
import { EmailService } from '../email/email.service';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { Role } from '../../common/enums/role.enum';

const ACTION_RULES: Partial<
  Record<TransportType, Partial<Record<ScanAction, WaybillStatus>>>
> = {
  [TransportType.TRANSFER]: {
    [ScanAction.INBOUND_ARRIVAL]: WaybillStatus.ARRIVED,
  },
  [TransportType.REALLOCATION]: {
    [ScanAction.REALLOCATION_DEPARTURE]: WaybillStatus.IN_TRANSIT,
    [ScanAction.REALLOCATION_ARRIVAL]: WaybillStatus.ARRIVED,
  },
  [TransportType.DELIVERY]: {
    [ScanAction.DELIVERY_DEPARTURE]: WaybillStatus.IN_TRANSIT,
    [ScanAction.INBOUND_ARRIVAL]: WaybillStatus.ARRIVED,
  },
};

const TRANSPORT_TYPE_LABEL: Record<TransportType, string> = {
  [TransportType.TRANSFER]: '转运',
  [TransportType.REALLOCATION]: '调拨',
  [TransportType.DELIVERY]: '派送',
};

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger(WaybillsService.name);

  // OrderVin / YardSlot 不直接注入 repo：只在 scan 事务里用 mgr.getRepository 拿
  // (必须和 waybill 更新同一事务，注入版 repo 用不到)
  constructor(
    @InjectRepository(Waybill)
    private readonly waybillsRepository: Repository<Waybill>,
    @InjectRepository(WaybillVin)
    private readonly waybillVinsRepository: Repository<WaybillVin>,
    private readonly dataSource: DataSource,
    private readonly trackingService: TrackingService,
    private readonly trackingGateway: TrackingGateway,
    private readonly queueService: QueueService,
    private readonly emailService: EmailService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // Waybill 有多种 scope 维度：内部按 org 树、CARRIER 按 carrierId、
  // CUSTOMER 需要跨 order 关联 customerId(waybill 表本身无 customerId)。
  // 因此不使用通用 applyScopeToQuery，直接就地实现 switch(scope.type)。
  private applyWaybillScope(
    qb: SelectQueryBuilder<Waybill>,
    scope: EffectiveScope,
    narrowToOrgId?: string,
  ) {
    if (scope.type === 'ORG') {
      let orgIds = scope.orgIds;
      if (narrowToOrgId) {
        if (!scope.orgIds.includes(narrowToOrgId)) {
          throw new ForbiddenException('无权按该机构筛选');
        }
        orgIds = [narrowToOrgId];
      }
      qb.andWhere('waybill.organizationId IN (:...__scopeOrgIds)', {
        __scopeOrgIds: orgIds,
      });
      if (scope.role === Role.YARD_STAFF && scope.scopeYardId) {
        qb.andWhere(
          '(waybill.originYardId = :__scopeYardId OR waybill.destinationYardId = :__scopeYardId)',
          { __scopeYardId: scope.scopeYardId },
        );
      }
    } else if (scope.type === 'CARRIER') {
      qb.andWhere('waybill.carrierId = :__scopeCarrierId', {
        __scopeCarrierId: scope.carrierId,
      });
    } else if (scope.type === 'CUSTOMER') {
      qb.leftJoin('waybill.order', 'order').andWhere(
        'order.customerId = :__scopeCustomerId',
        { __scopeCustomerId: scope.customerId },
      );
    }
  }

  findAll(
    scope: EffectiveScope,
    filters?: {
      narrowToOrgId?: string;
      status?: WaybillStatus;
      originYardId?: string;
      transportType?: TransportType;
    },
  ): Promise<Waybill[]> {
    const qb = this.waybillsRepository
      .createQueryBuilder('waybill')
      .leftJoinAndSelect('waybill.vins', 'vins')
      .leftJoinAndSelect('waybill.carrier', 'carrier')
      .leftJoinAndSelect('waybill.driver', 'driver')
      .leftJoinAndSelect('waybill.vehicle', 'vehicle')
      .leftJoinAndSelect('waybill.originYard', 'originYard')
      .leftJoinAndSelect('waybill.destinationDealer', 'destinationDealer')
      .leftJoinAndSelect('waybill.organization', 'organization')
      .orderBy('waybill.createdAt', 'DESC');
    this.applyWaybillScope(qb, scope, filters?.narrowToOrgId);
    if (filters?.status) {
      qb.andWhere('waybill.status = :__status', { __status: filters.status });
    }
    if (filters?.originYardId) {
      qb.andWhere('waybill.originYardId = :__oyid', {
        __oyid: filters.originYardId,
      });
    }
    if (filters?.transportType) {
      qb.andWhere('waybill.transportType = :__tt', {
        __tt: filters.transportType,
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, scope: EffectiveScope): Promise<Waybill> {
    const qb = this.waybillsRepository
      .createQueryBuilder('waybill')
      .leftJoinAndSelect('waybill.vins', 'vins')
      .leftJoinAndSelect('waybill.carrier', 'carrier')
      .leftJoinAndSelect('waybill.driver', 'driver')
      .leftJoinAndSelect('waybill.vehicle', 'vehicle')
      .leftJoinAndSelect('waybill.originYard', 'originYard')
      .leftJoinAndSelect('waybill.destinationYard', 'destinationYard')
      .leftJoinAndSelect('waybill.organization', 'organization')
      .where('waybill.id = :id', { id });
    this.applyWaybillScope(qb, scope);
    const waybill = await qb.getOne();
    if (!waybill) throw new NotFoundException('运单不存在');
    return waybill;
  }

  // 内部使用（如扫码流程不带用户 scope）：直接按 ID 查，不做 scope 校验
  findByIdUnscoped(id: string): Promise<Waybill | null> {
    return this.waybillsRepository.findOne({
      where: { id },
      relations: [
        'vins',
        'carrier',
        'driver',
        'vehicle',
        'originYard',
        'destinationYard',
        'order',
      ],
    });
  }

  async create(dto: CreateWaybillDto, scope: EffectiveScope): Promise<Waybill> {
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    return this.dataSource
      .transaction(async (manager) => {
        const waybillCode = `WB${Date.now()}${randomUUID().slice(0, 4).toUpperCase()}`;
        const waybill = manager.create(Waybill, {
          waybillCode,
          organizationId: dto.organizationId,
          customerWaybillCode: dto.customerWaybillCode,
          transportType: dto.transportType,
          orderId: dto.orderId ?? null,
          originYardId: dto.originYardId ?? null,
          originText: dto.originText,
          destinationYardId: dto.destinationYardId ?? null,
          destinationDealerId: dto.destinationDealerId ?? null,
          carrierId: dto.carrierId ?? null,
          driverId: dto.driverId ?? null,
          vehicleId: dto.vehicleId ?? null,
          towType: dto.towType ?? null,
          remark: dto.remark,
        });
        const savedWaybill = await manager.save(waybill);

        const vins = dto.vins.map((v) =>
          manager.create(WaybillVin, { ...v, waybillId: savedWaybill.id }),
        );
        await manager.save(vins);

        return manager.findOneOrFail(Waybill, {
          where: { id: savedWaybill.id },
          relations: ['vins', 'carrier', 'originYard', 'destinationYard'],
        });
      })
      .then((waybill) => {
        void this.notifyCarrierAssigned(waybill);
        return waybill;
      });
  }

  private async notifyCarrierAssigned(waybill: Waybill): Promise<void> {
    if (!waybill.carrier?.email) return;
    try {
      await this.emailService.sendCarrierWaybillAssignedEmail(
        waybill.carrier.email,
        {
          carrierName: waybill.carrier.name,
          waybillCode: waybill.waybillCode,
          transportTypeLabel: TRANSPORT_TYPE_LABEL[waybill.transportType],
          originLabel: waybill.originYard?.name ?? waybill.originText ?? '-',
          destinationLabel: waybill.destinationYard?.name ?? '-',
          vinList: waybill.vins.map((v) => v.vin),
        },
      );
    } catch (err) {
      this.logger.error(
        `供应商运单通知邮件发送失败: ${waybill.waybillCode}`,
        err as Error,
      );
    }
  }

  // 扫码统一入口：所有变动包在一个事务里，避免 slot 释放 / waybill 状态 / vin 签收
  // 中间任何一步失败留下脏数据
  async scan(
    dto: ScanDto,
    operatorUserId?: string,
    operatorYardId?: string | null,
  ) {
    const result = await this.dataSource.transaction(async (mgr) => {
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const waybillRepo = mgr.getRepository(Waybill);
      const orderVinRepo = mgr.getRepository(OrderVin);
      const slotRepo = mgr.getRepository(YardSlot);

      const waybillVin = await waybillVinRepo.findOne({
        where: { vin: dto.vin },
        order: { createdAt: 'DESC' },
      });
      if (!waybillVin) {
        throw new NotFoundException('VIN无效或无对应待执行的运单/调拨单');
      }

      const waybill = await waybillRepo.findOne({
        where: { id: waybillVin.waybillId },
      });
      if (!waybill) throw new NotFoundException('运单不存在');
      if (waybill.isLocked) {
        throw new BadRequestException(
          '该VIN的运输数据已到达锁定，不可再次扫码',
        );
      }

      // 签收走独立路径：逐 VIN 标记，不改整单 status；等全部签完再统一 ARRIVED
      if (dto.action === ScanAction.SIGNED) {
        if (waybillVin.isSigned) {
          throw new BadRequestException(`VIN ${dto.vin} 已签收，不可重复签收`);
        }
        waybillVin.isSigned = true;
        await waybillVinRepo.save(waybillVin);

        const allVins = await waybillVinRepo.find({
          where: { waybillId: waybill.id },
        });
        const allSigned = allVins.every((v) => v.isSigned);
        if (allSigned) {
          waybill.status = WaybillStatus.ARRIVED;
          waybill.isLocked = true;
          await waybillRepo.save(waybill);
        }
        return { waybill, statusChanged: allSigned };
      }

      // 其他 action 通过 ACTION_RULES 校验
      const rule = ACTION_RULES[waybill.transportType]?.[dto.action];
      if (!rule) {
        throw new BadRequestException('该运输类型不支持此扫码操作');
      }

      if (
        dto.action === ScanAction.DELIVERY_DEPARTURE &&
        !dto.attachmentUrls?.length
      ) {
        throw new BadRequestException('启运操作需上传交付凭证(SJ照片)');
      }

      if (dto.yardId) {
        const isDepartureAction = [
          ScanAction.REALLOCATION_DEPARTURE,
          ScanAction.DELIVERY_DEPARTURE,
        ].includes(dto.action);
        const isArrivalAction = [
          ScanAction.INBOUND_ARRIVAL,
          ScanAction.REALLOCATION_ARRIVAL,
        ].includes(dto.action);
        if (
          isDepartureAction &&
          waybill.originYardId &&
          dto.yardId !== waybill.originYardId
        ) {
          throw new ForbiddenException('仅始发场地可执行启运扫码');
        }
        if (
          isArrivalAction &&
          waybill.destinationYardId &&
          dto.yardId !== waybill.destinationYardId
        ) {
          throw new ForbiddenException('仅目的场地可执行到达扫码');
        }
      }

      // 启运时释放整张运单里所有 VIN 对应的 slot
      // 业务实际：一辆拖车通常一次拉走整张运单的车，扫一台 VIN 上传一次 SJ 凭证
      // 就代表"这批全部离场"，逐台扫既繁琐也不符合装车节奏
      if (
        dto.action === ScanAction.DELIVERY_DEPARTURE ||
        dto.action === ScanAction.REALLOCATION_DEPARTURE
      ) {
        const allVinsOfWaybill = await waybillVinRepo.find({
          where: { waybillId: waybill.id },
        });
        const orderVins = await orderVinRepo.find({
          where: allVinsOfWaybill.map((wv) => ({ vin: wv.vin })),
        });
        const slotIds = orderVins
          .map((ov) => ov.slotId)
          .filter((id): id is string => !!id);
        if (slotIds.length > 0) {
          const slots = await slotRepo.find({
            where: slotIds.map((id) => ({ id })),
          });
          for (const slot of slots) {
            slot.status = YardSlotStatus.VACANT;
            slot.currentVin = null;
            slot.assignedAt = null;
          }
          await slotRepo.save(slots);
        }
        for (const ov of orderVins) ov.slotId = null;
        if (orderVins.length > 0) await orderVinRepo.save(orderVins);
      }

      waybill.status = rule;
      if (rule === WaybillStatus.ARRIVED) {
        waybill.isLocked = true;
      }
      await waybillRepo.save(waybill);
      return { waybill, statusChanged: true };
    });

    // 事务外副作用：审计日志 + WebSocket 广播 + 队列通知
    // (放事务外是为了不阻塞事务提交；即使这些失败也不影响业务状态一致性)
    await this.trackingService.appendLog({
      waybillId: result.waybill.id,
      vin: dto.vin,
      action: dto.action,
      yardId: dto.yardId ?? null,
      operatorUserId: operatorUserId ?? null,
      vehicleCheckInfo: dto.vehicleCheckInfo ?? null,
      attachmentUrls: dto.attachmentUrls ?? null,
      remark: dto.remark,
    });

    if (result.statusChanged) {
      this.trackingGateway.emitWaybillStatusChanged({
        waybillId: result.waybill.id,
        vin: dto.vin,
        status: result.waybill.status,
        yardId: dto.yardId ?? operatorYardId ?? null,
      });
      await this.queueService.notifyWaybillStatusChanged({
        waybillId: result.waybill.id,
        vin: dto.vin,
        status: result.waybill.status,
      });
    }

    return result.waybill;
  }

  // 供司机扫码前用：给一个 VIN，返回它当前挂在哪张 Waybill 上 + 是否已签收
  async lookupVin(vin: string): Promise<{
    vin: string;
    isSigned: boolean;
    waybill: Waybill;
  }> {
    const waybillVin = await this.waybillVinsRepository.findOne({
      where: { vin },
      order: { createdAt: 'DESC' },
    });
    if (!waybillVin) throw new NotFoundException('未找到此 VIN 的运单');
    const waybill = await this.findByIdUnscoped(waybillVin.waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    return { vin, isSigned: waybillVin.isSigned, waybill };
  }

  // 撤销未启运的运单：车物理上还没走 (没启运 + 没锁定) 才允许
  // 撤销 = 硬删 waybill + waybill_vins + 释放 OrderVin.isAllocated
  // 场景：业务员开错单/客户改主意，需要重新分配 VIN
  async cancelWaybill(
    id: string,
    scope: EffectiveScope,
    operatorUserId?: string,
  ): Promise<void> {
    const waybill = await this.findByIdUnscoped(id);
    if (!waybill) throw new NotFoundException('运单不存在');
    // scope 校验
    if (scope.type === 'ORG' && !scope.orgIds.includes(waybill.organizationId)) {
      throw new ForbiddenException('无权撤销此运单');
    }
    if (scope.type !== 'ORG') {
      throw new ForbiddenException('仅内部账号可撤销运单');
    }
    if (waybill.status !== WaybillStatus.NOT_ARRIVED) {
      throw new BadRequestException(
        `运单已 ${waybill.status}，无法撤销 (车已启运/送达)`,
      );
    }
    if (waybill.isLocked) {
      throw new BadRequestException('运单已锁定，无法撤销');
    }

    const releasedVins = await this.dataSource.transaction(async (mgr) => {
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const waybillRepo = mgr.getRepository(Waybill);
      const orderVinRepo = mgr.getRepository(OrderVin);

      // 拿 waybill 里所有 VIN
      const wvs = await waybillVinRepo.find({ where: { waybillId: id } });
      const vinCodes = wvs.map((wv) => wv.vin);

      // 释放 OrderVin.isAllocated
      if (vinCodes.length > 0) {
        await orderVinRepo
          .createQueryBuilder()
          .update()
          .set({ isAllocated: false })
          .where('vin IN (:...vins)', { vins: vinCodes })
          .execute();
      }

      // 删 waybill_vins + waybill (CASCADE 会自动删 vin，但显式删更清晰)
      await waybillVinRepo.delete({ waybillId: id });
      await waybillRepo.delete(id);
      return vinCodes;
    });

    // 每台车都记一条撤销运单事件，方便按 VIN 查轨迹
    for (const vin of releasedVins) {
      await this.audit.log({
        operationType: OperationType.WAYBILL_CANCEL,
        vin,
        operatorUserId,
        payload: {
          waybillId: id,
          waybillCode: waybill.waybillCode,
        },
      });
    }
  }

  // 单台 VIN 装车：只写 WaybillVin.loadedAt+loadPhotoKeys；不动 waybill.status，不释放 slot
  // 目的：真实 FVL 装车是逐台完成的，全部装完才在闸口整单出仓
  async loadVin(
    waybillId: string,
    vin: string,
    photoKeys: string[],
    remark: string | undefined,
    user: { userId: string; role: Role; scopeYardId?: string | null },
  ): Promise<{ loadedAt: Date; loadedCount: number; totalCount: number }> {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    this.assertCanLoad(waybill, user);

    const result = await this.dataSource.transaction(async (mgr) => {
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const wv = await waybillVinRepo.findOne({ where: { waybillId, vin } });
      if (!wv) throw new NotFoundException('该 VIN 不在此运单');
      if (wv.loadedAt) {
        throw new BadRequestException('该 VIN 已装车，请勿重复扫码');
      }
      wv.loadedAt = new Date();
      wv.loadPhotoKeys = photoKeys;
      await waybillVinRepo.save(wv);

      const all = await waybillVinRepo.find({ where: { waybillId } });
      return {
        loadedAt: wv.loadedAt,
        loadedCount: all.filter((v) => v.loadedAt).length,
        totalCount: all.length,
      };
    });

    await this.trackingService.appendLog({
      waybillId,
      vin,
      action: ScanAction.DELIVERY_LOAD,
      yardId: waybill.originYardId ?? null,
      operatorUserId: user.userId,
      attachmentUrls: photoKeys,
      remark,
    });

    return result;
  }

  // 撤销单台装车：清 loadedAt + loadPhotoKeys（例如扫错车/上错车位）
  async unloadVin(
    waybillId: string,
    vin: string,
    user: { userId: string; role: Role; scopeYardId?: string | null },
  ): Promise<{ loadedCount: number; totalCount: number }> {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    this.assertCanLoad(waybill, user);

    const result = await this.dataSource.transaction(async (mgr) => {
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const wv = await waybillVinRepo.findOne({ where: { waybillId, vin } });
      if (!wv) throw new NotFoundException('该 VIN 不在此运单');
      if (!wv.loadedAt) {
        throw new BadRequestException('该 VIN 未装车，无需撤销');
      }
      wv.loadedAt = null;
      wv.loadPhotoKeys = [];
      await waybillVinRepo.save(wv);

      const all = await waybillVinRepo.find({ where: { waybillId } });
      return {
        loadedCount: all.filter((v) => v.loadedAt).length,
        totalCount: all.length,
      };
    });

    await this.trackingService.appendLog({
      waybillId,
      vin,
      action: ScanAction.DELIVERY_LOAD_UNDO,
      yardId: waybill.originYardId ?? null,
      operatorUserId: user.userId,
    });

    return result;
  }

  // 整单启运出闸：校验全部装完 → 释放 slot → 状态翻 IN_TRANSIT
  async departWaybill(
    waybillId: string,
    gatePhotoKeys: string[] | undefined,
    remark: string | undefined,
    user: { userId: string; role: Role; scopeYardId?: string | null },
  ): Promise<Waybill> {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    this.assertCanLoad(waybill, user);
    if (waybill.status !== WaybillStatus.NOT_ARRIVED) {
      throw new BadRequestException(
        `运单已 ${waybill.status}，无法再次启运`,
      );
    }
    if (waybill.transportType !== TransportType.DELIVERY) {
      throw new BadRequestException('此接口仅用于派送运单启运');
    }

    const { updated, vins } = await this.dataSource.transaction(async (mgr) => {
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const waybillRepo = mgr.getRepository(Waybill);
      const orderVinRepo = mgr.getRepository(OrderVin);
      const slotRepo = mgr.getRepository(YardSlot);

      const wvs = await waybillVinRepo.find({ where: { waybillId } });
      if (wvs.length === 0) throw new BadRequestException('运单无 VIN');
      const unloaded = wvs.filter((v) => !v.loadedAt);
      if (unloaded.length > 0) {
        throw new BadRequestException(
          `还有 ${unloaded.length} 台未装车：${unloaded.map((v) => v.vin).join(', ')}`,
        );
      }

      // 释放整单所有 VIN 对应的 slot
      const orderVins = await orderVinRepo.find({
        where: wvs.map((wv) => ({ vin: wv.vin })),
      });
      const slotIds = orderVins
        .map((ov) => ov.slotId)
        .filter((id): id is string => !!id);
      if (slotIds.length > 0) {
        const slots = await slotRepo.find({
          where: slotIds.map((id) => ({ id })),
        });
        for (const slot of slots) {
          slot.status = YardSlotStatus.VACANT;
          slot.currentVin = null;
          slot.assignedAt = null;
        }
        await slotRepo.save(slots);
      }
      for (const ov of orderVins) ov.slotId = null;
      if (orderVins.length > 0) await orderVinRepo.save(orderVins);

      const w = await waybillRepo.findOne({ where: { id: waybillId } });
      if (!w) throw new NotFoundException('运单不存在');
      w.status = WaybillStatus.IN_TRANSIT;
      await waybillRepo.save(w);
      return { updated: w, vins: wvs };
    });

    // 每台车都写一条 DELIVERY_DEPARTURE 日志，闸口合影只挂在第一台上避免存储冗余
    for (let i = 0; i < vins.length; i += 1) {
      await this.trackingService.appendLog({
        waybillId,
        vin: vins[i].vin,
        action: ScanAction.DELIVERY_DEPARTURE,
        yardId: waybill.originYardId ?? null,
        operatorUserId: user.userId,
        attachmentUrls: i === 0 ? (gatePhotoKeys ?? null) : null,
        remark: i === 0 ? remark : undefined,
      });
    }

    // 广播一次（消费者按 waybillId 刷新，vin 传第一台即可）
    const representativeVin = vins[0]?.vin ?? '';
    this.trackingGateway.emitWaybillStatusChanged({
      waybillId,
      vin: representativeVin,
      status: updated.status,
      yardId: waybill.originYardId ?? null,
    });
    await this.queueService.notifyWaybillStatusChanged({
      waybillId,
      vin: representativeVin,
      status: updated.status,
    });

    return updated;
  }

  // 装车/启运权限：ORG_ADMIN/HQ_ADMIN 全通；YARD_STAFF 仅本人所属场地=运单始发地
  private assertCanLoad(
    waybill: Waybill,
    user: { role: Role; scopeYardId?: string | null },
  ): void {
    if (user.role === Role.HQ_ADMIN || user.role === Role.ORG_ADMIN) return;
    if (user.role === Role.YARD_STAFF) {
      if (waybill.originYardId && user.scopeYardId === waybill.originYardId) {
        return;
      }
      throw new ForbiddenException('仅始发场地作业员可执行装车/启运');
    }
    throw new ForbiddenException('无权执行装车/启运');
  }

  // 分派司机 / 拖车。承运商开单后由 CARRIER_STAFF 补录常用，也可 ORG_ADMIN 直接指派
  // 仅未启运 (NOT_ARRIVED) 且未锁定的运单允许改；避免运输中/到达后再篡改责任人
  async assignWaybill(
    waybillId: string,
    dto: { driverId?: string | null; vehicleId?: string | null },
    user: {
      userId: string;
      role: Role;
      carrierId?: string | null;
    },
  ): Promise<Waybill> {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');

    if (
      user.role !== Role.HQ_ADMIN &&
      user.role !== Role.ORG_ADMIN &&
      !(user.role === Role.CARRIER_STAFF && waybill.carrierId === user.carrierId)
    ) {
      throw new ForbiddenException('无权分派此运单');
    }

    if (waybill.status !== WaybillStatus.NOT_ARRIVED) {
      throw new BadRequestException(
        `运单已 ${waybill.status}，无法再改司机/车辆`,
      );
    }
    if (waybill.isLocked) {
      throw new BadRequestException('运单已锁定，无法修改');
    }

    // 校验司机/车辆归属：必须属于此运单的承运商，防跨供应商乱指
    if (dto.driverId) {
      const driver = await this.dataSource
        .getRepository('drivers')
        .findOne({ where: { id: dto.driverId } });
      if (!driver) throw new NotFoundException('司机不存在');
      if ((driver as { carrierId?: string }).carrierId !== waybill.carrierId) {
        throw new BadRequestException('司机不属于此运单的承运商');
      }
    }
    if (dto.vehicleId) {
      const vehicle = await this.dataSource
        .getRepository('vehicles')
        .findOne({ where: { id: dto.vehicleId } });
      if (!vehicle) throw new NotFoundException('拖车不存在');
      if ((vehicle as { carrierId?: string }).carrierId !== waybill.carrierId) {
        throw new BadRequestException('拖车不属于此运单的承运商');
      }
    }

    const before = { driverId: waybill.driverId, vehicleId: waybill.vehicleId };
    if (dto.driverId !== undefined) waybill.driverId = dto.driverId;
    if (dto.vehicleId !== undefined) waybill.vehicleId = dto.vehicleId;
    const saved = await this.waybillsRepository.save(waybill);

    // 每台车都写一条审计日志，追溯"谁在何时分派了谁"
    const wvs = await this.waybillVinsRepository.find({ where: { waybillId } });
    for (const wv of wvs) {
      await this.audit.log({
        operationType: OperationType.WAYBILL_ASSIGN,
        vin: wv.vin,
        operatorUserId: user.userId,
        payload: {
          waybillId,
          waybillCode: waybill.waybillCode,
          before,
          after: { driverId: saved.driverId, vehicleId: saved.vehicleId },
        },
      });
    }

    return saved;
  }
}
