import {
  Body,
  Controller,
  Get,
  Param,
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
}
