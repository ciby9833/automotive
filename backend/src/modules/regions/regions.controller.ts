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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { ScopeService } from '../../common/scope/scope.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RegionsService } from './regions.service';
import { RegionsAdminService } from './regions-admin.service';
import { CreateRegionDto, UpdateRegionDto } from './regions.dto';

@ApiTags('regions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('regions')
export class RegionsController {
  constructor(
    private readonly regions: RegionsService,
    private readonly admin: RegionsAdminService,
    private readonly scopes: ScopeService,
  ) {}

  /** 某机构所在国家的区域（省/州 + 县/市），前端按 parent_id 组树 */
  @Permissions(
    Permission.PARTNER_CUSTOMER_VIEW,
    Permission.TRANSPORT_FINANCE_VIEW,
    Permission.TRANSPORT_VIEW,
  )
  @Get()
  async list(
    @Query('organizationId') organizationId: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    const scope = await this.scopes.resolve(u);
    this.scopes.assertOrgReadable(scope, organizationId);
    const country = await this.regions.countryOf(organizationId);
    return { country, items: country ? await this.regions.list(country) : [] };
  }

  // ---------------------------------------------------------------- 维护
  /** 当前账号能维护哪些国家的区划 */
  @Permissions(Permission.REGION_MANAGE)
  @Get('manage/countries')
  async manageableCountries(@CurrentUser() u: AuthenticatedUser) {
    return this.admin.countries(await this.scopes.resolve(u));
  }

  /** 某国全部区划（含引用数量，用于判断能否删除） */
  @Permissions(Permission.REGION_MANAGE)
  @Get('manage')
  async manageList(
    @Query('country') country: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.admin.list(await this.scopes.resolve(u), country);
  }

  @Permissions(Permission.REGION_MANAGE)
  @Post()
  async create(
    @Body() d: CreateRegionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.admin.create(await this.scopes.resolve(u), d);
  }

  @Permissions(Permission.REGION_MANAGE)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateRegionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.admin.update(await this.scopes.resolve(u), id, d);
  }

  @Permissions(Permission.REGION_MANAGE)
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.admin.remove(await this.scopes.resolve(u), id);
  }
}
