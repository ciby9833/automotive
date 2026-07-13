import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

// 内部人员创建邀请码时的入参（targetType/targetId 由 URL 路径决定，不放 DTO）
export class CreateInvitationDto {
  @IsEnum(Role)
  inviteeRole: Role;

  // 过期天数，1-30；不传默认 7
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  ttlDays?: number;
}
