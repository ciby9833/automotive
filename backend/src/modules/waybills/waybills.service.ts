import { InventoryService } from '../inventory/inventory.service';
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
import { Driver } from '../carriers/entities/driver.entity';
import { Vehicle } from '../carriers/entities/vehicle.entity';
import { Carrier } from '../carriers/entities/carrier.entity';
import { PartnerStatus } from '../../common/enums/partner-status.enum';
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
import { AuthenticatedUser } from '../auth/auth.types';
import { Order } from '../orders/entities/order.entity';
import { Yard } from '../yards/entities/yard.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import {
  DEFAULT_PAGE_SIZE,
  EXPORT_MAX_ROWS,
  PaginatedResult,
  resolveSortColumn,
} from '../../common/dto/paginated.dto';

const TRANSPORT_TYPE_LABEL: Record<TransportType, string> = {
  [TransportType.TRANSFER]: '转运',
  [TransportType.REALLOCATION]: '调拨',
  [TransportType.DELIVERY]: '派送',
};

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger(WaybillsService.name);

  constructor(
    private readonly inventory: InventoryService,
    @InjectRepository(Waybill)
    private readonly waybillsRepository: Repository<Waybill>,
    @InjectRepository(WaybillVin)
    private readonly waybillVinsRepository: Repository<WaybillVin>,
    @InjectRepository(Carrier)
    private readonly carriersRepository: Repository<Carrier>,
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

  async findAll(
    scope: EffectiveScope,
    filters?: {
      narrowToOrgId?: string;
      status?: WaybillStatus;
      originYardId?: string;
      transportType?: TransportType;
      waybillCode?: string;
      customerWaybillCode?: string;
      carrierId?: string;
      destinationDealerId?: string;
      dateFrom?: string;
      dateTo?: string;
      // 按 VIN 模糊搜（通过 waybill_vins 表）；不改主表分页语义
      vin?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      all?: boolean;
    },
  ): Promise<PaginatedResult<Waybill>> {
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
    // 排序白名单：只允许这些列，其他一律回落 createdAt DESC（防 SQL 注入）
    const sortColumn = resolveSortColumn(
      filters?.sortBy,
      {
        waybillCode: 'waybill.waybillCode',
        customerWaybillCode: 'waybill.customerWaybillCode',
        status: 'waybill.status',
        createdAt: 'waybill.createdAt',
      },
      'waybill.createdAt',
    );
    const sortOrder: 'ASC' | 'DESC' =
      filters?.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const qb = this.waybillsRepository
      .createQueryBuilder('waybill')
      .leftJoinAndSelect('waybill.vins', 'vins')
      .leftJoinAndSelect('waybill.carrier', 'carrier')
      .leftJoinAndSelect('waybill.driver', 'driver')
      .leftJoinAndSelect('waybill.vehicle', 'vehicle')
      .leftJoinAndSelect('waybill.originYard', 'originYard')
      .leftJoinAndSelect('waybill.destinationDealer', 'destinationDealer')
      .leftJoinAndSelect('waybill.organization', 'organization')
      .orderBy(sortColumn, sortOrder)
      // 主排序稳定后追加 id 作为 tie-breaker（避免相同 createdAt 时分页跳行）
      .addOrderBy('waybill.id', 'DESC');
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
    if (filters?.waybillCode) {
      qb.andWhere('waybill.waybillCode ILIKE :__wc', {
        __wc: `%${filters.waybillCode}%`,
      });
    }
    if (filters?.customerWaybillCode) {
      qb.andWhere('waybill.customerWaybillCode ILIKE :__cwc', {
        __cwc: `%${filters.customerWaybillCode}%`,
      });
    }
    if (filters?.carrierId) {
      qb.andWhere('waybill.carrierId = :__cid', { __cid: filters.carrierId });
    }
    if (filters?.destinationDealerId) {
      qb.andWhere('waybill.destinationDealerId = :__ddid', {
        __ddid: filters.destinationDealerId,
      });
    }
    if (filters?.dateFrom) {
      qb.andWhere('waybill.createdAt >= :__df', { __df: filters.dateFrom });
    }
    if (filters?.dateTo) {
      qb.andWhere('waybill.createdAt <= :__dt', { __dt: filters.dateTo });
    }
    if (filters?.vin) {
      // EXISTS 子查询：不影响主表 join / distinct，避免因一单多 VIN 复制主行
      qb.andWhere(
        `EXISTS (SELECT 1 FROM waybill_vins wv_search
                 WHERE wv_search.waybill_id = waybill.id
                   AND wv_search.vin ILIKE :__vin)`,
        { __vin: `%${filters.vin.trim()}%` },
      );
    }
    // 导出通道：all=true 跳过分页返全量；先 count 挡住超大结果避免拖垮服务
    if (filters?.all) {
      const total = await qb.getCount();
      if (total > EXPORT_MAX_ROWS) {
        throw new BadRequestException(
          `导出结果 ${total} 条超过上限 ${EXPORT_MAX_ROWS}，请缩短时间范围或加过滤条件`,
        );
      }
      const items = await qb.getMany();
      return { items, total, page: 1, pageSize: total };
    }
    // 正常分页：一次 SQL 拿 items + total（getManyAndCount 会自己发 2 条 query）
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
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
      .leftJoinAndSelect('waybill.destinationDealer', 'destinationDealer')
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
        'destinationDealer',
        'order',
      ],
    });
  }

  async create(dto: CreateWaybillDto, scope: EffectiveScope): Promise<Waybill> {
    this.scopeService.assertOrgWritable(scope, dto.organizationId);
    if (dto.transportType === TransportType.DELIVERY)
      throw new BadRequestException('出库派送必须通过出库订单开单');
    const manager = this.dataSource.manager;
    const order = dto.orderId
      ? await manager.findOneBy(Order, { id: dto.orderId })
      : null;
    if (!order || order.organizationId !== dto.organizationId)
      throw new BadRequestException('必须关联当前机构的订单');
    for (const yardId of [dto.originYardId, dto.destinationYardId].filter(
      Boolean,
    )) {
      const yard = await manager.findOneBy(Yard, {
        id: yardId!,
        organizationId: dto.organizationId,
        isActive: true,
      });
      if (!yard) throw new BadRequestException('场地必须属于当前机构且有效');
    }
    if (
      dto.destinationDealerId &&
      !(await manager.findOneBy(CustomerAddress, {
        id: dto.destinationDealerId,
        customerId: order.customerId,
      }))
    )
      throw new BadRequestException('目的门店不属于订单客户');
    for (const row of dto.vins) {
      if (
        !(await manager.findOneBy(OrderVin, {
          vin: row.vin,
          orderId: order.id,
        }))
      )
        throw new BadRequestException('VIN 必须属于关联订单');
    }
    if (dto.carrierId) {
      const carrier = await this.carriersRepository.findOne({
        where: { id: dto.carrierId },
      });
      if (!carrier) throw new NotFoundException('承运商不存在');
      if (carrier.organizationId !== dto.organizationId)
        throw new ForbiddenException('承运商必须属于当前机构');
      if (carrier.status !== PartnerStatus.ACTIVE) {
        throw new BadRequestException('承运商当前未开放新增业务');
      }
    }
    if (
      dto.driverId &&
      (!dto.carrierId ||
        !(await manager.findOneBy(Driver, {
          id: dto.driverId,
          carrierId: dto.carrierId,
          isActive: true,
        })))
    )
      throw new BadRequestException('司机未启用或不属于此承运商');
    if (
      dto.vehicleId &&
      (!dto.carrierId ||
        !(await manager.findOneBy(Vehicle, {
          id: dto.vehicleId,
          carrierId: dto.carrierId,
          isActive: true,
        })))
    )
      throw new BadRequestException('车辆未启用或不属于此承运商');
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

  // Web and Android use this endpoint only for signing. Legacy departure/arrival mutations removed.
  async scan(dto: ScanDto, operator: AuthenticatedUser) {
    if (dto.action !== ScanAction.SIGNED)
      throw new BadRequestException('此接口仅支持签收');
    const scope = await this.scopeService.resolve(operator);
    const candidate = await this.waybillVinsRepository.findOne({
      where: { vin: dto.vin },
      order: { createdAt: 'DESC' },
    });
    if (!candidate) throw new NotFoundException('VIN 无对应运单');
    await this.findOne(candidate.waybillId, scope);
    const result = await this.dataSource.transaction(async (mgr) => {
      const waybill = await mgr.findOneOrFail(Waybill, {
        where: { id: candidate.waybillId },
        lock: { mode: 'pessimistic_write' },
      });
      if (scope.type === 'ORG')
        this.scopeService.assertOrgWritable(scope, waybill.organizationId);
      if (
        waybill.status !== WaybillStatus.IN_TRANSIT ||
        waybill.isLocked ||
        waybill.transportType !== TransportType.DELIVERY
      )
        throw new BadRequestException('只有已启运、运输中的派送运单可以签收');
      const wv = await mgr.findOneByOrFail(WaybillVin, { id: candidate.id });
      if (wv.isSigned) throw new BadRequestException('该 VIN 已签收');
      wv.isSigned = true;
      await mgr.save(wv);
      const unsigned = await mgr.countBy(WaybillVin, {
        waybillId: waybill.id,
        isSigned: false,
      });
      if (!unsigned) {
        waybill.status = WaybillStatus.ARRIVED;
        waybill.isLocked = true;
        await mgr.save(waybill);
      }
      await this.trackingService.appendLog(
        {
          waybillId: waybill.id,
          vin: dto.vin,
          action: ScanAction.SIGNED,
          operatorUserId: operator.userId,
          attachmentUrls: dto.attachmentUrls ?? null,
          remark: dto.remark,
          vehicleCheckInfo: dto.vehicleCheckInfo ?? null,
        },
        mgr,
      );
      return mgr.findOneOrFail(Waybill, {
        where: { id: waybill.id },
        relations: ['vins', 'carrier', 'originYard', 'destinationDealer'],
      });
    });
    await this.publishStatus(result, dto.vin);
    return result;
  }

  // 供司机扫码前用：给一个 VIN，返回它当前挂在哪张 Waybill 上 + 是否已签收
  async lookupVin(
    vin: string,
    scope: EffectiveScope,
  ): Promise<{
    vin: string;
    isSigned: boolean;
    waybill: Waybill;
  }> {
    const waybillVin = await this.waybillVinsRepository.findOne({
      where: { vin },
      order: { createdAt: 'DESC' },
    });
    if (!waybillVin) throw new NotFoundException('未找到此 VIN 的运单');
    const waybill = await this.findOne(waybillVin.waybillId, scope);
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
    if (
      scope.type === 'ORG' &&
      !scope.orgIds.includes(waybill.organizationId)
    ) {
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

    await this.dataSource.transaction(async (mgr) => {
      const waybillVinRepo = mgr.getRepository(WaybillVin);
      const waybillRepo = mgr.getRepository(Waybill);
      const orderVinRepo = mgr.getRepository(OrderVin);

      await this.pendingWaybill(mgr, id);
      // 拿 waybill 里所有 VIN
      const wvs = await waybillVinRepo.find({ where: { waybillId: id } });
      if (wvs.some((v) => v.loadedAt))
        throw new BadRequestException('请先卸车回库，再撤销运单');
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

      // 删除前记录快照；删除会将日志的 waybill_id 置空，原编号和 ID 保留在 payload。
      for (const vin of vinCodes) {
        await this.audit.log(
          {
            operationType: OperationType.WAYBILL_CANCEL,
            vin,
            waybillId: id,
            yardId: waybill.originYardId,
            operatorUserId,
            payload: {
              waybillId: id,
              waybillCode: waybill.waybillCode,
              before: waybill,
              after: null,
            },
          },
          mgr,
        );
      }
      await waybillVinRepo.delete({ waybillId: id });
      await waybillRepo.delete(id);
    });
  }

  private async publishStatus(waybill: Waybill, vin: string) {
    const event = {
      waybillId: waybill.id,
      vin,
      status: waybill.status,
      yardId: waybill.originYardId,
    };
    try {
      this.trackingGateway.emitWaybillStatusChanged(event);
      await this.queueService.notifyWaybillStatusChanged(event);
    } catch (error) {
      this.logger.error(
        `库存及审计已提交，状态通知失败: ${(error as Error).message}`,
      );
    }
  }

  private async pendingWaybill(
    mgr: import('typeorm').EntityManager,
    id: string,
  ) {
    const waybill = await mgr.findOne(Waybill, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !waybill ||
      waybill.status !== WaybillStatus.NOT_ARRIVED ||
      waybill.isLocked ||
      waybill.transportType !== TransportType.DELIVERY
    )
      throw new BadRequestException('仅未启运派送运单可执行此操作');
    return waybill;
  }

  async loadVin(
    waybillId: string,
    vin: string,
    photoKeys: string[],
    remark: string | undefined,
    user: AuthenticatedUser,
  ) {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    await this.assertCanLoad(waybill, user);
    if (!photoKeys.length) throw new BadRequestException('装车照片必填');
    return this.dataSource.transaction(async (mgr) => {
      const current = await this.pendingWaybill(mgr, waybillId);
      const wv = await mgr.findOneBy(WaybillVin, { waybillId, vin });
      if (!wv || wv.loadedAt)
        throw new BadRequestException('VIN 不属于此运单或已装车');
      const stock = await this.inventory.active(mgr, vin);
      if (
        stock.yardId !== current.originYardId ||
        stock.organizationId !== current.organizationId
      )
        throw new BadRequestException('车辆不在始发场地');
      await this.inventory.load(mgr, stock, {
        userId: user.userId,
        waybillId,
        reason: remark,
      });
      wv.loadedAt = new Date();
      wv.loadPhotoKeys = photoKeys;
      await mgr.save(wv);
      await this.trackingService.appendLog(
        {
          waybillId,
          vin,
          action: ScanAction.DELIVERY_LOAD,
          yardId: current.originYardId,
          operatorUserId: user.userId,
          attachmentUrls: photoKeys,
          remark,
        },
        mgr,
      );
      const all = await mgr.findBy(WaybillVin, { waybillId });
      return {
        loadedAt: wv.loadedAt,
        loadedCount: all.filter((v) => v.loadedAt).length,
        totalCount: all.length,
      };
    });
  }

  async unloadVin(
    waybillId: string,
    vin: string,
    user: AuthenticatedUser,
    slotId?: string,
  ) {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    await this.assertCanLoad(waybill, user);
    return this.dataSource.transaction(async (mgr) => {
      const current = await this.pendingWaybill(mgr, waybillId);
      const wv = await mgr.findOneBy(WaybillVin, { waybillId, vin });
      if (!wv?.loadedAt) throw new BadRequestException('该 VIN 未装车');
      const stock = await this.inventory.active(mgr, vin);
      if (stock.yardId !== current.originYardId)
        throw new BadRequestException('车辆不在始发场地');
      const target = slotId ?? stock.lastSlotId;
      if (!target) throw new BadRequestException('请选择卸车后的实际库位');
      await this.inventory.move(
        mgr,
        stock,
        target,
        { userId: user.userId, waybillId },
        true,
      );
      wv.loadedAt = null;
      wv.loadPhotoKeys = [];
      await mgr.save(wv);
      await this.trackingService.appendLog(
        {
          waybillId,
          vin,
          action: ScanAction.DELIVERY_LOAD_UNDO,
          yardId: current.originYardId,
          operatorUserId: user.userId,
        },
        mgr,
      );
      const all = await mgr.findBy(WaybillVin, { waybillId });
      return {
        loadedCount: all.filter((v) => v.loadedAt).length,
        totalCount: all.length,
      };
    });
  }

  async departWaybill(
    waybillId: string,
    gatePhotoKeys: string[] | undefined,
    remark: string | undefined,
    user: AuthenticatedUser,
  ) {
    const waybill = await this.findByIdUnscoped(waybillId);
    if (!waybill) throw new NotFoundException('运单不存在');
    await this.assertCanLoad(waybill, user);
    const result = await this.dataSource.transaction(async (mgr) => {
      const current = await this.pendingWaybill(mgr, waybillId);
      if (!current.driverId || !current.vehicleId)
        throw new BadRequestException('启运前必须分配司机和运输车辆');
      const vins = await mgr.find(WaybillVin, {
        where: { waybillId },
        order: { vin: 'ASC' },
      });
      if (!vins.length || vins.some((v) => !v.loadedAt))
        throw new BadRequestException('必须逐台完成全部车辆装车后才能启运');
      for (const wv of vins) {
        const stock = await this.inventory.active(mgr, wv.vin);
        if (
          stock.yardId !== current.originYardId ||
          stock.organizationId !== current.organizationId
        )
          throw new BadRequestException('车辆不在始发场地');
        await this.inventory.close(mgr, stock, 'DEPARTURE', {
          userId: user.userId,
          waybillId,
          reason: remark,
        });
        await this.trackingService.appendLog(
          {
            waybillId,
            vin: wv.vin,
            action: ScanAction.DELIVERY_DEPARTURE,
            yardId: current.originYardId,
            operatorUserId: user.userId,
            attachmentUrls: gatePhotoKeys ?? null,
            remark,
          },
          mgr,
        );
      }
      current.status = WaybillStatus.IN_TRANSIT;
      await mgr.save(current);
      return mgr.findOneOrFail(Waybill, {
        where: { id: waybillId },
        relations: ['vins', 'carrier', 'originYard', 'destinationDealer'],
      });
    });
    await this.publishStatus(result, result.vins[0]?.vin ?? '');
    return result;
  }

  // 装车/启运权限：ORG_ADMIN/HQ_ADMIN 全通；YARD_STAFF 仅本人所属场地=运单始发地；
  // 承运商账号仅可操作分派给自己承运商的运单。
  private async assertCanLoad(
    waybill: Waybill,
    user: AuthenticatedUser,
  ): Promise<void> {
    const scope = await this.scopeService.resolve(user);
    if (scope.type === 'ORG')
      this.scopeService.assertOrgWritable(scope, waybill.organizationId);
    if (scope.role === Role.ORG_ADMIN) return;
    if (user.role === Role.YARD_STAFF) {
      if (waybill.originYardId && user.scopeYardId === waybill.originYardId) {
        return;
      }
      throw new ForbiddenException('仅始发场地作业员可执行装车/启运');
    }
    if (user.role === Role.CARRIER_DRIVER || user.role === Role.CARRIER_STAFF) {
      if (waybill.carrierId && user.carrierId === waybill.carrierId) {
        return;
      }
      throw new ForbiddenException('仅承运商本人可执行装车/启运');
    }
    throw new ForbiddenException('无权执行装车/启运');
  }

  // 分派司机 / 拖车。承运商开单后由 CARRIER_STAFF 补录常用，也可 ORG_ADMIN 直接指派
  // 仅未启运 (NOT_ARRIVED) 且未锁定的运单允许改；避免运输中/到达后再篡改责任人
  async assignWaybill(
    waybillId: string,
    dto: { driverId?: string | null; vehicleId?: string | null },
    scope: EffectiveScope,
    operatorUserId: string,
  ): Promise<Waybill> {
    return this.dataSource.transaction(async (mgr) => {
      const waybill = await mgr.findOne(Waybill, {
        where: { id: waybillId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!waybill) throw new NotFoundException('运单不存在');

      this.assertCanAssignWaybill(waybill, scope);

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
        const driver = await mgr.getRepository(Driver).findOne({
          where: { id: dto.driverId },
        });
        if (!driver) throw new NotFoundException('司机不存在');
        if (driver.carrierId !== waybill.carrierId) {
          throw new BadRequestException('司机不属于此运单的承运商');
        }
        if (!driver.isActive)
          throw new BadRequestException('司机已停用，无法分派');
      }
      if (dto.vehicleId) {
        const vehicle = await mgr.getRepository(Vehicle).findOne({
          where: { id: dto.vehicleId },
        });
        if (!vehicle) throw new NotFoundException('拖车不存在');
        if (vehicle.carrierId !== waybill.carrierId) {
          throw new BadRequestException('拖车不属于此运单的承运商');
        }
        if (!vehicle.isActive)
          throw new BadRequestException('拖车已停用，无法分派');
      }

      const before = {
        driverId: waybill.driverId,
        vehicleId: waybill.vehicleId,
      };
      if (dto.driverId !== undefined) waybill.driverId = dto.driverId;
      if (dto.vehicleId !== undefined) waybill.vehicleId = dto.vehicleId;
      const saved = await mgr.save(waybill);

      // 每台车都写一条审计日志，追溯"谁在何时分派了谁"
      const wvs = await mgr
        .getRepository(WaybillVin)
        .find({ where: { waybillId } });
      for (const wv of wvs) {
        await this.audit.log(
          {
            operationType: OperationType.WAYBILL_ASSIGN,
            vin: wv.vin,
            waybillId,
            yardId: waybill.originYardId ?? null,
            operatorUserId,
            payload: {
              waybillCode: waybill.waybillCode,
              before,
              after: { driverId: saved.driverId, vehicleId: saved.vehicleId },
            },
          },
          mgr,
        );
      }

      return saved;
    });
  }

  private assertCanAssignWaybill(
    waybill: Waybill,
    scope: EffectiveScope,
  ): void {
    if (scope.type === 'ORG') {
      this.scopeService.assertOrgWritable(scope, waybill.organizationId);
      if (scope.role !== Role.HQ_ADMIN && scope.role !== Role.ORG_ADMIN) {
        throw new ForbiddenException('无权分派此运单');
      }
      if (!scope.orgIds.includes(waybill.organizationId)) {
        throw new ForbiddenException('无权分派此运单');
      }
      return;
    }

    if (scope.type === 'CARRIER') {
      if (
        scope.role === Role.CARRIER_STAFF &&
        waybill.carrierId === scope.carrierId
      ) {
        return;
      }
      throw new ForbiddenException('无权分派此运单');
    }

    throw new ForbiddenException('无权分派此运单');
  }
}
