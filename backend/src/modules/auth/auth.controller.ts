import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SelectOrgDto } from './dto/select-org.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowPreAuth } from '../../common/decorators/allow-preauth.decorator';
import { permissionsForRole } from '../../common/rbac/role-permissions';
import type { AuthenticatedUser } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  // 多 membership 场景下的第二步：拿预授权 token 挑一个 org 换完整 token
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPreAuth()
  @Post('select-org')
  selectOrg(@CurrentUser() user: AuthenticatedUser, @Body() dto: SelectOrgDto) {
    return this.authService.selectOrg(user.userId, dto.organizationId);
  }

  // 已登录状态切换机构；后端换发新 token，前端替换 localStorage 里的 token 后硬重载
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('switch-org')
  switchOrg(@CurrentUser() user: AuthenticatedUser, @Body() dto: SelectOrgDto) {
    return this.authService.switchOrg(user.userId, dto.organizationId);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: '如该邮箱已注册，我们已发送重置密码邮件' };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: '密码重置成功，请使用新密码登录' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPreAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { ...user, permissions: permissionsForRole(user.role) };
  }
}
