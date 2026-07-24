import {
  Body,
  Controller,
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
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ScopeService } from '../../common/scope/scope.service';
import { CarriersService } from './carriers.service';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreateCarrierUserDto } from './dto/create-carrier-user.dto';
import { UpdateCarrierUserDto } from './dto/update-carrier-user.dto';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

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
  @Get(':id/drivers')
  async listDrivers(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.listDrivers(id, scope);
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
  @Get(':id/vehicles')
  async listVehicles(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.listVehicles(id, scope);
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

  // ============ 承运商账号管理 ============
  // 权限：HQ/ORG_ADMIN + CARRIER_STAFF；CARRIER_STAFF 通过 findOne 校验仅能操作自家
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Permissions(Permission.CARRIER_USER_VIEW)
  @Get(':id/users')
  async listCarrierUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('keyword') keyword?: string,
    @Query('role') role?: Role,
    @Query('active') active?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.listCarrierUsers(id, scope, {
      keyword,
      role,
      active:
        active === undefined ? undefined : active === 'true' || active === '1',
    });
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Permissions(Permission.CARRIER_USER_MANAGE)
  @Post(':id/users')
  async createCarrierUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCarrierUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.createCarrierUser(id, dto, scope, user.userId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Permissions(Permission.CARRIER_USER_MANAGE)
  @Patch(':id/users/:userId')
  async updateCarrierUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateCarrierUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.updateCarrierUser(
      id,
      userId,
      dto,
      scope,
      user.userId,
    );
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Permissions(Permission.CARRIER_USER_MANAGE)
  @Patch(':id/users/:userId/deactivate')
  async deactivateCarrierUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.deactivateCarrierUser(
      id,
      userId,
      scope,
      user.userId,
    );
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Permissions(Permission.CARRIER_USER_MANAGE)
  @Patch(':id/users/:userId/reactivate')
  async reactivateCarrierUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.reactivateCarrierUser(
      id,
      userId,
      scope,
      user.userId,
    );
  }

  // 一次性明文密码回传给管理员，请立即转交并关闭弹窗
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_STAFF)
  @Permissions(Permission.CARRIER_USER_MANAGE)
  @Post(':id/users/:userId/reset-password')
  async resetCarrierUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.carriersService.resetCarrierUserPassword(
      id,
      userId,
      scope,
      user.userId,
    );
  }
}
