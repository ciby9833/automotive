import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { OutboundService } from './outbound.service';
import { ImportOutboundOrderDto } from './dto/import-outbound-order.dto';
import { PlanWaybillDto } from './dto/plan-waybill.dto';

@ApiTags('outbound')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('outbound')
export class OutboundController {
  constructor(
    private readonly outboundService: OutboundService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.OUTBOUND_IMPORT)
  @Post('orders/import')
  async import(
    @Body() dto: ImportOutboundOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.outboundService.importOutboundOrder(dto, scope, user.userId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Permissions(Permission.OUTBOUND_VIEW)
  @Get('orders')
  async listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('customerId') customerId?: string,
    @Query('customerOrderNo') customerOrderNo?: string,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('all') all?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.outboundService.listOutboundOrders(scope, {
      customerId,
      customerOrderNo,
      organizationId,
      status,
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

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Permissions(Permission.OUTBOUND_VIEW)
  @Get('orders/:id')
  async orderDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.outboundService.getOutboundOrderDetail(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.OUTBOUND_PLAN)
  @Get('plan/pool')
  async listPlanPool(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('customerId') customerId?: string,
    @Query('yardId') yardId?: string,
    @Query('dealerCode') dealerCode?: string,
    @Query('groupCode') groupCode?: string,
    @Query('towType') towType?: string,
    @Query('vin') vin?: string,
    @Query('outboundOrderId') outboundOrderId?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.outboundService.listPlanPool(scope, {
      organizationId,
      customerId,
      yardId,
      dealerCode,
      groupCode,
      towType,
      vin,
      outboundOrderId,
    });
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.OUTBOUND_PLAN)
  @Get('plan/exceptions')
  async listPlanExceptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('customerId') customerId?: string,
    @Query('yardId') yardId?: string,
    @Query('outboundOrderId') outboundOrderId?: string,
    @Query('vin') vin?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.outboundService.listPlanExceptions(scope, {
      organizationId,
      customerId,
      yardId,
      outboundOrderId,
      vin,
    });
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.OUTBOUND_PLAN)
  @Post('plan')
  async plan(
    @Body() dto: PlanWaybillDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.outboundService.planWaybill(dto, scope, user.userId);
  }

  // 出库单软取消 (仅 ACTIVE + 无运单)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Permissions(Permission.OUTBOUND_IMPORT)
  @Delete('orders/:id')
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    await this.outboundService.cancelOutboundOrder(id, scope, user.userId);
    return { ok: true };
  }
}
