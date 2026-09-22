import { InboundService } from '../inbound/inbound.service';
import { InboundScanDto } from '../inbound/dto/inbound-scan.dto';
import {
  InventoryReasonDto,
  InventoryAdjustmentDto,
} from './dto/inventory-adjustment.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ScopeService } from '../../common/scope/scope.service';
import { YardsService } from './yards.service';
import { ZonesService } from './zones.service';
import { CreateYardDto } from './dto/create-yard.dto';
import {
  CreateYardZoneDto,
  UpdateYardZoneDto,
  GenerateSlotsByZoneDto,
} from './dto/create-yard-zone.dto';
import { MoveSlotDto } from './dto/move-slot.dto';
import { BatchAssignSlotDto } from './dto/batch-assign-slot.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@ApiTags('yards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('yards')
export class YardsController {
  constructor(
    private readonly inboundService: InboundService,
    private readonly yardsService: YardsService,
    private readonly zonesService: ZonesService,
    private readonly scopeService: ScopeService,
  ) {}

  // ========== 场地 CRUD ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_YARD_CRUD)
  @Post()
  async create(
    @Body() dto: CreateYardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.create(dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_VIEW_BOARD)
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.findAll(scope, organizationId);
  }

  // ========== 场地下的库位（含 zone 信息，前端拼展示码） ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_VIEW_BOARD)
  @Get(':id/slots')
  async findSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.findSlots(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_VIEW_BOARD)
  @Get(':id/stats')
  async stats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.yardStats(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_VIEW_BOARD)
  @Get(':id/board')
  async board(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('since') since?: string,
  ) {
    return this.yardsService.board(
      id,
      await this.scopeService.resolve(user),
      since,
    );
  }

  // ========== 场地下的 Zone 配置 ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.YARD_VIEW_BOARD)
  @Get(':id/zones')
  async listZones(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.zonesService.list(id, scope);
  }

  // 入库扫描/看板端拉可用 zone 下拉（不需要 SETUP_ZONE_CRUD）
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_VIEW_BOARD)
  @Get(':id/zones/active')
  async listActiveZones(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.zonesService.listActiveForYard(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_ZONE_CRUD)
  @Post(':id/zones')
  async createZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateYardZoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.zonesService.create(id, dto, scope, user.userId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_ZONE_CRUD)
  @Patch(':id/zones/:zoneId')
  async updateZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: UpdateYardZoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.zonesService.update(id, zoneId, dto, scope, user.userId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_ZONE_CRUD)
  @Delete(':id/zones/:zoneId')
  async deleteZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.zonesService.remove(id, zoneId, scope, user.userId);
  }

  // 按 zone 尺寸批量生成 slot（幂等；重复调用只补空缺）
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_ZONE_CRUD)
  @Post(':id/zones/:zoneId/generate-slots')
  async generateSlotsForZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: GenerateSlotsByZoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.zonesService.generateSlots(id, zoneId, dto, scope, user.userId);
  }

  // ========== 场地运营(日常) ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_ASSIGN_SLOT)
  @Patch('slots/:slotId/assign')
  async assignSlot(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: InboundScanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.inboundScan(
      { ...dto, slotId, zoneId: undefined },
      user,
    );
  }

  @Roles(Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_RELEASE_SLOT)
  @Post('inventory/:vin/undo-inbound')
  async undoInbound(
    @Param('vin') vin: string,
    @Body() dto: InventoryReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.yardsService.undoInbound(
      vin,
      dto.reason,
      await this.scopeService.resolve(user),
      user.userId,
    );
  }

  @Roles(Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_ADJUST_INVENTORY)
  @Post('inventory/adjustments')
  async adjustInventory(
    @Body() dto: InventoryAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.yardsService.adjustInventory(
      dto,
      await this.scopeService.resolve(user),
      user.userId,
    );
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_MOVE_VEHICLE)
  @Post('slots/move')
  async moveSlot(
    @Body() dto: MoveSlotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.moveSlot(
      dto.fromSlotId,
      dto.toSlotId,
      scope,
      user.userId,
    );
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_MOVE_VEHICLE)
  @Post('slots/batch-assign')
  async batchAssign(
    @Body() dto: BatchAssignSlotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.batchAssignSlots(
      dto.yardId,
      dto.items,
      scope,
      user.userId,
    );
  }

  // ========== VIN 库存查询 ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF, Role.CUSTOMER)
  @Permissions(Permission.YARD_VIEW_VIN_INVENTORY)
  @Get('/vin/:vin/lifecycle')
  async vinLifecycle(
    @Param('vin') vin: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.getVinLifecycle(vin, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF, Role.CUSTOMER)
  @Permissions(Permission.YARD_VIEW_VIN_INVENTORY)
  @Get('/inventory/vin')
  async vinInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('vin') vin?: string,
    @Query('organizationId') organizationId?: string,
    @Query('yardId') yardId?: string,
    @Query('slotCode') slotCode?: string,
    @Query('orderCode') orderCode?: string,
    @Query('minStayDays') minStayDays?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('all') all?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.vinInventory(scope, {
      vin,
      organizationId,
      yardId,
      slotCode,
      orderCode,
      minStayDays: minStayDays ? Number(minStayDays) : undefined,
      dateFrom,
      dateTo,
      page: page ? Math.max(1, Number(page)) : undefined,
      pageSize: pageSize
        ? Math.max(1, Math.min(500, Number(pageSize)))
        : undefined,
      sortBy,
      sortOrder:
        sortOrder === 'asc' ? 'asc' : sortOrder === 'desc' ? 'desc' : undefined,
      all: all === 'true' || all === '1',
    });
  }
}
