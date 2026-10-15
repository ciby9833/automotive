import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { ScopeService } from '../../common/scope/scope.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RegionsService } from './regions.service';

@ApiTags('regions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('regions')
export class RegionsController {
  constructor(
    private readonly regions: RegionsService,
    private readonly scopes: ScopeService,
  ) {}

  /** 某机构所在国家的区域（省/州 + 县/市），前端按 parent_id 组树 */
  @Permissions(Permission.PARTNER_CUSTOMER_VIEW, Permission.TRANSPORT_FINANCE_VIEW, Permission.TRANSPORT_VIEW)
  @Get()
  async list(@Query('organizationId') organizationId: string, @CurrentUser() u: AuthenticatedUser) {
    const scope = await this.scopes.resolve(u);
    this.scopes.assertOrgReadable(scope, organizationId);
    const country = await this.regions.countryOf(organizationId);
    return { country, items: country ? await this.regions.list(country) : [] };
  }
}
