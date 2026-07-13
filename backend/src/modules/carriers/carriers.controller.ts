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
import { CarriersService } from './carriers.service';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

// 供应商管理：总部/机构管理员维护供应商主数据；供应商业务员看自己名下的记录
@ApiTags('carriers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('carriers')
export class CarriersController {
  constructor(
    private readonly carriersService: CarriersService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post()
  async create(
    @Body() dto: CreateCarrierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.create(dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.findAll(scope, organizationId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.findOne(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Post(':id/drivers')
  async addDriver(
    @Param('id') id: string,
    @Body() dto: CreateDriverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.addDriver(id, dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Post(':id/vehicles')
  async addVehicle(
    @Param('id') id: string,
    @Body() dto: CreateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.addVehicle(id, dto, scope);
  }
}
