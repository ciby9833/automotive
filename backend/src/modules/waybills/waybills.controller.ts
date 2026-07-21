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
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ScopeService } from '../../common/scope/scope.service';
import { WaybillsService } from './waybills.service';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { ScanDto } from './dto/scan.dto';
import { LoadVinDto } from './dto/load-vin.dto';
import { DepartWaybillDto } from './dto/depart-waybill.dto';
import { WaybillStatus } from '../../common/enums/waybill-status.enum';
import { TransportType } from '../../common/enums/order-type.enum';

@ApiTags('waybills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('waybills')
export class WaybillsController {
  constructor(
    private readonly waybillsService: WaybillsService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post()
  async create(
    @Body() dto: CreateWaybillDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.waybillsService.create(dto, scope);
  }

  @Roles(
    Role.HQ_ADMIN,
    Role.ORG_ADMIN,
    Role.YARD_STAFF,
    Role.CARRIER_STAFF,
    Role.CUSTOMER,
  )
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: WaybillStatus,
    @Query('originYardId') originYardId?: string,
    @Query('transportType') transportType?: TransportType,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.waybillsService.findAll(scope, {
      narrowToOrgId: organizationId,
      status,
      originYardId,
      transportType,
    });
  }

  // 司机扫码前预查：给出 vin 所在运单 + 是否已签收；不改状态
  @Roles(Role.CARRIER_DRIVER, Role.CARRIER_STAFF, Role.YARD_STAFF, Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Get('lookup/:vin')
  lookupVin(@Param('vin') vin: string) {
    return this.waybillsService.lookupVin(vin);
  }

  @Roles(
    Role.HQ_ADMIN,
    Role.ORG_ADMIN,
    Role.YARD_STAFF,
    Role.CARRIER_STAFF,
    Role.CUSTOMER,
  )
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.waybillsService.findOne(id, scope);
  }

  @Roles(
    Role.HQ_ADMIN,
    Role.ORG_ADMIN,
    Role.YARD_STAFF,
    Role.CARRIER_DRIVER,
    Role.CARRIER_STAFF,
  )
  @Post('scan')
  scan(@Body() dto: ScanDto, @CurrentUser() user: AuthenticatedUser) {
    const operatorYardId =
      user.role === Role.YARD_STAFF ? user.scopeYardId : null;
    return this.waybillsService.scan(dto, user.userId, operatorYardId);
  }

  // 单台 VIN 装车 (逐台扫码+拍照，不改运单状态)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Post(':id/vins/:vin/load')
  async loadVin(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vin') vin: string,
    @Body() dto: LoadVinDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waybillsService.loadVin(id, vin, dto.photoKeys, dto.remark, {
      userId: user.userId,
      role: user.role,
      scopeYardId: user.scopeYardId,
    });
  }

  // 撤销单台 VIN 装车 (扫错车/换车位时用)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Delete(':id/vins/:vin/load')
  async unloadVin(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vin') vin: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waybillsService.unloadVin(id, vin, {
      userId: user.userId,
      role: user.role,
      scopeYardId: user.scopeYardId,
    });
  }

  // 整单启运出闸：全部装完后一次性触发状态翻转 + slot 释放
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Post(':id/depart')
  async depart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DepartWaybillDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waybillsService.departWaybill(id, dto.gatePhotoKeys, dto.remark, {
      userId: user.userId,
      role: user.role,
      scopeYardId: user.scopeYardId,
    });
  }

  // 撤销未启运的运单：释放 VIN.isAllocated 让业务员能重开
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Delete(':id')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    await this.waybillsService.cancelWaybill(id, scope, user.userId);
    return { ok: true };
  }
}
