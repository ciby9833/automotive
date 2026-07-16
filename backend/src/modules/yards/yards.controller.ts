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
import { CreateYardDto } from './dto/create-yard.dto';
import { CreateYardSlotDto } from './dto/create-yard-slot.dto';
import { BulkCreateSlotsDto } from './dto/bulk-create-slots.dto';
import { AssignSlotDto } from './dto/assign-slot.dto';
import { MoveSlotDto } from './dto/move-slot.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@ApiTags('yards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('yards')
export class YardsController {
  constructor(
    private readonly yardsService: YardsService,
    private readonly scopeService: ScopeService,
  ) {}

  // ========== 场地 CRUD (系统管理/场地配置) ==========

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
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.findAll(scope, organizationId);
  }

  // ========== 库位 CRUD (系统管理/库位配置) ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Get(':id/slots')
  async findSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.findSlots(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Get(':id/stats')
  async stats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.yardStats(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_SLOT_CRUD)
  @Post(':id/slots')
  async createSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateYardSlotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.createSlot(id, dto, scope);
  }

  // 批量创建：Excel 导入 / 网格生成器共用；返回 created + skipped 计数
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_SLOT_IMPORT)
  @Post(':id/slots/bulk')
  async bulkCreateSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkCreateSlotsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.bulkCreateSlots(id, dto.slots, scope);
  }

  // 批量删除：只删空置库位，占用中的返回在 blocked 计数
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.SETUP_SLOT_DELETE)
  @Delete(':id/slots')
  async bulkDeleteSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { slotIds: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.bulkDeleteSlots(id, body.slotIds ?? [], scope);
  }

  // ========== 场地运营(日常) ==========

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_ASSIGN_SLOT)
  @Patch('slots/:slotId/assign')
  assignSlot(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: AssignSlotDto,
  ) {
    return this.yardsService.assignSlot(slotId, dto.vin);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_RELEASE_SLOT)
  @Patch('slots/:slotId/release')
  releaseSlot(@Param('slotId', ParseUUIDPipe) slotId: string) {
    return this.yardsService.releaseSlot(slotId);
  }

  // 场内移位：一步完成源→目标
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.YARD_MOVE_VEHICLE)
  @Post('slots/move')
  moveSlot(@Body() dto: MoveSlotDto) {
    return this.yardsService.moveSlot(dto.fromSlotId, dto.toSlotId);
  }

  // ========== VIN 库存查询 ==========

  // VIN 全生命周期：场地看板抽屉点击 slot / VIN 库存点车牌都调此接口
  // 返回 orderVin + 出库运单列表 + 扫码事件流水
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
    @Query('minStayDays') minStayDays?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.yardsService.vinInventory(scope, {
      vin,
      organizationId,
      yardId,
      minStayDays: minStayDays ? Number(minStayDays) : undefined,
    });
  }
}
