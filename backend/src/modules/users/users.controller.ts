import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddMembershipDto } from './dto/add-membership.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.create(dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.findAll(scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.update(id, dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Patch(':id/deactivate')
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.deactivate(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Patch(':id/reactivate')
  async reactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.reactivate(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Get(':id/memberships')
  async listMemberships(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.listMemberships(id, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post(':id/memberships')
  async addMembership(
    @Param('id') id: string,
    @Body() dto: AddMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.usersService.addMembership(id, dto, scope);
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Delete(':id/memberships/:membershipId')
  async removeMembership(
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    await this.usersService.removeMembership(id, membershipId, scope);
    return { success: true };
  }
}
