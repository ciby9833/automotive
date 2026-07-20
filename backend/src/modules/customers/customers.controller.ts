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
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ScopeService } from '../../common/scope/scope.service';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import {
  CreateCustomerAddressDto,
  ImportCustomerAddressesDto,
} from './dto/create-customer-address.dto';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post()
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.customersService.create(dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.customersService.findAll(scope, organizationId);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.customersService.findOne(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Post(':id/addresses')
  async addAddress(
    @Param('id') id: string,
    @Body() dto: CreateCustomerAddressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.customersService.addAddress(id, dto, scope);
  }

  // 批量导入 BYD 门店 Excel: 一次可导入几百条，code 相同自动 update
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Post(':id/addresses/import')
  async importAddresses(
    @Param('id') id: string,
    @Body() dto: ImportCustomerAddressesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.customersService.importAddresses(id, dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CUSTOMER)
  @Patch('addresses/:addressId')
  async updateAddress(
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: Partial<CreateCustomerAddressDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.customersService.updateAddress(addressId, dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Delete('addresses/:addressId')
  async deleteAddress(
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    await this.customersService.deleteAddress(addressId, scope);
    return { ok: true };
  }
}
