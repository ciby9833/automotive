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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { Permission } from '../../common/enums/permission.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ScopeService } from '../../common/scope/scope.service';
import { InboundService } from './inbound.service';
import { ImportInboundOrderDto } from './dto/import-inbound-order.dto';
import { PickupScanDto } from './dto/pickup-scan.dto';
import { InboundScanDto, CreateInboundBatchDto } from './dto/inbound-scan.dto';
import { UpdateOrderVinDto } from './dto/update-order-vin.dto';
import { RegisterUnexpectedVinDto } from './dto/register-unexpected-vin.dto';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';

@ApiTags('inbound')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InboundController {
  constructor(
    private readonly inboundService: InboundService,
    private readonly scopeService: ScopeService,
  ) {}

  // ============ 极兔操作员：导入 & 查看 ============

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.INBOUND_IMPORT)
  @Post('inbound/orders/import')
  async import(
    @Body() dto: ImportInboundOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.inboundService.importInboundOrder(dto, scope, user.userId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF, Role.CUSTOMER)
  @Permissions(Permission.INBOUND_VIEW)
  @Get('inbound/orders')
  async listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('customerId') customerId?: string,
    @Query('destinationYardId') destinationYardId?: string,
    @Query('customerOrderNo') customerOrderNo?: string,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED',
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.inboundService.listInboundOrders(scope, {
      customerId,
      destinationYardId,
      customerOrderNo,
      organizationId,
      status,
    });
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF, Role.CUSTOMER)
  @Permissions(Permission.INBOUND_VIEW)
  @Get('inbound/orders/:id')
  async orderDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('keyword') keyword?: string,
    @Query('status') status?: OrderVinArrivalStatus,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.inboundService.getInboundOrderDetail(id, scope, {
      keyword,
      status,
    });
  }

  // 单条 VIN 纠错编辑 (仅 EXPECTED)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.INBOUND_IMPORT)
  @Patch('inbound/orders/:orderId/vins/:vinId')
  async updateOrderVin(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('vinId', ParseUUIDPipe) vinId: string,
    @Body() dto: UpdateOrderVinDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.inboundService.updateOrderVin(
      orderId,
      vinId,
      dto,
      scope,
      user.userId,
    );
  }

  // 单条 VIN 软取消 (数据保留，只切 arrivalStatus=CANCELLED + 记录操作人)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.INBOUND_IMPORT)
  @Delete('inbound/orders/:orderId/vins/:vinId')
  async cancelOrderVin(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('vinId', ParseUUIDPipe) vinId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    await this.inboundService.cancelOrderVin(
      orderId,
      vinId,
      scope,
      user.userId,
    );
    return { ok: true };
  }

  // 整单软取消 (保留订单壳、清空 VINs、记录操作人；仅 EXPECTED VIN 允许)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.INBOUND_IMPORT)
  @Delete('inbound/orders/:id')
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    await this.inboundService.cancelInboundOrder(id, scope, user.userId);
    return { ok: true };
  }

  // 已取消订单重新导入 VIN (恢复 ACTIVE + 追加 VIN)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.INBOUND_IMPORT)
  @Post('inbound/orders/:id/reactivate')
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportInboundOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.inboundService.reactivateInboundOrder(
      id,
      dto.vins,
      scope,
      user.userId,
    );
  }

  // ============ 供应商司机：提货扫描 ============

  @Roles(Role.CARRIER_DRIVER, Role.CARRIER_STAFF)
  @Permissions(Permission.PICKUP_SCAN)
  @Post('pickup/scan')
  pickupScan(@Body() dto: PickupScanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.pickupScan(dto, user);
  }

  // 扫码前预查(不改状态)：帮司机确认这个 VIN 能不能提
  @Roles(Role.CARRIER_DRIVER, Role.CARRIER_STAFF)
  @Permissions(Permission.PICKUP_SCAN)
  @Get('pickup/lookup/:vin')
  pickupLookup(
    @Param('vin') vin: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.lookupVinForPickup(vin, user);
  }

  @Roles(
    Role.CARRIER_DRIVER,
    Role.CARRIER_STAFF,
    Role.HQ_ADMIN,
    Role.ORG_ADMIN,
  )
  @Permissions(Permission.PICKUP_VIEW)
  @Get('pickup/my')
  myPickups(@CurrentUser() user: AuthenticatedUser) {
    return this.inboundService.listMyPickups(user);
  }

  // ============ 场地业务员：入库扫描 & 批次 ============

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.INBOUND_SCAN)
  @Post('inbound/scan')
  inboundScan(
    @Body() dto: InboundScanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.inboundScan(dto, user);
  }

  // 未登记 VIN 到仓的应急登记 (车不在任何订单里但已到仓)
  // 建/找散车订单 → 挂 VIN → 走入库分配 一步完成
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.INBOUND_SCAN)
  @Post('inbound/scan/unregistered')
  registerUnexpected(
    @Body() dto: RegisterUnexpectedVinDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.registerUnexpectedVinAndScan(dto, user);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.INBOUND_BATCH_MANAGE)
  @Post('inbound/batches')
  createBatch(
    @Body() dto: CreateInboundBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inboundService.createBatch(dto, user);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Permissions(Permission.INBOUND_VIEW)
  @Get('inbound/batches')
  async listBatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('yardId') yardId?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.inboundService.listBatches(scope, yardId);
  }
}
