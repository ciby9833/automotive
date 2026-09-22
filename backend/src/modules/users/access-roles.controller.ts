import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission as P } from '../../common/enums/permission.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ScopeService } from '../../common/scope/scope.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessRolesService } from './access-roles.service';
import {
  CreateAccessRoleDto,
  RoleScopeDto,
  UpdateAccessRoleDto,
} from './dto/access-role.dto';

@Controller('roles')
export class AccessRolesController {
  constructor(
    private readonly roles: AccessRolesService,
    private readonly scopes: ScopeService,
  ) {}
  @Get('catalog')
  @Permissions(P.SETUP_ROLE_VIEW)
  async catalog(@Query() q: RoleScopeDto, @CurrentUser() u: AuthenticatedUser) {
    return this.roles.catalog(q, await this.scopes.resolve(u));
  }
  @Get('assignable')
  @Permissions(P.SETUP_USER_MEMBERSHIP)
  async assignable(
    @Query() q: RoleScopeDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.roles.list(q, await this.scopes.resolve(u), true);
  }
  @Get()
  @Permissions(P.SETUP_ROLE_VIEW)
  async list(@Query() q: RoleScopeDto, @CurrentUser() u: AuthenticatedUser) {
    return this.roles.list(q, await this.scopes.resolve(u));
  }
  @Post()
  @Permissions(P.SETUP_ROLE_MANAGE)
  async create(
    @Body() d: CreateAccessRoleDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.roles.create(d, await this.scopes.resolve(u));
  }
  @Patch(':id')
  @Permissions(P.SETUP_ROLE_MANAGE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateAccessRoleDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.roles.update(id, d, await this.scopes.resolve(u));
  }
}
