import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOperatingPolicyDto } from './dto/update-operating-policy.dto';
import {
  UpdateOrganizationDto,
  UpdateOrganizationStatusDto,
} from './dto/update-organization.dto';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN)
  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.organizationsService.create(dto, scope);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    const scope = await this.scopeService.resolve(user);
    return this.organizationsService.findAll(scope);
  }

  @Roles(Role.HQ_ADMIN)
  @Get('management')
  async management(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listManagement(
      await this.scopeService.resolve(user),
    );
  }

  @Roles(Role.HQ_ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationsService.update(
      id,
      dto,
      await this.scopeService.resolve(user),
    );
  }

  @Roles(Role.HQ_ADMIN)
  @Patch(':id/status')
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationsService.setActive(
      id,
      dto.isActive,
      await this.scopeService.resolve(user),
    );
  }

  @Roles(Role.HQ_ADMIN)
  @Patch(':id/operating-policy')
  async updateOperatingPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatingPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.organizationsService.updateOperatingPolicy(id, dto, scope);
  }
}
