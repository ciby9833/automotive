import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { RegisterWithInvitationDto } from './dto/register-with-invitation.dto';
import { ScopeService } from '../../common/scope/scope.service';

// 生成邀请码：只允许 HQ_ADMIN / ORG_ADMIN；scope 校验交给 service 层做（确保生成的邀请
// 一定指向当前用户 scope 内的 carrier/customer，不能越权给别家机构的对象发邀请）
@ApiTags('invitations')
@Controller()
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly scopeService: ScopeService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post('carriers/:id/invitations')
  async createForCarrier(
    @Param('id', ParseUUIDPipe) carrierId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.invitationsService.createForCarrier(
      scope,
      carrierId,
      dto.inviteeRole,
      dto.ttlDays,
      user.userId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HQ_ADMIN, Role.ORG_ADMIN)
  @Post('customers/:id/invitations')
  async createForCustomer(
    @Param('id', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const scope = await this.scopeService.resolve(user);
    return this.invitationsService.createForCustomer(
      scope,
      customerId,
      dto.inviteeRole,
      dto.ttlDays,
      user.userId,
    );
  }

  // 公开：预览邀请信息（用户点开注册链接时前端拉这个显示"你被 XX 邀请为 XX 角色"）
  @Get('public/invitations/:token')
  preview(@Param('token') token: string) {
    return this.invitationsService.previewByToken(token);
  }

  // 公开：凭 token 完成注册
  @Post('public/register-with-invitation')
  async register(@Body() dto: RegisterWithInvitationDto) {
    return this.invitationsService.registerWithToken(
      dto.token,
      dto.username,
      dto.password,
      dto.displayName,
      dto.email ?? null,
    );
  }
}
