import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ScopeService } from '../../common/scope/scope.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';
import { DailySnapshotService } from './daily-snapshot.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly dailySnapshotService: DailySnapshotService,
    private readonly scopeService: ScopeService,
  ) {}

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF)
  @Get()
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('yardId') yardId?: string,
    @Query('timezone') timezone?: string,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.dashboardService.getDashboard(scope, {
      organizationId,
      yardId,
      timezone,
    });
  }

  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Get('snapshots/status')
  async snapshotStatus(@CurrentUser() user: AuthenticatedUser) {
    const scope = await this.scopeService.resolve(user);
    return this.dailySnapshotService.getStatus(scope);
  }

  @Roles(Role.HQ_ADMIN)
  @Post('snapshots/run-due')
  async runDueSnapshots() {
    await this.dailySnapshotService.captureAllDue();
    return { accepted: true };
  }
}
