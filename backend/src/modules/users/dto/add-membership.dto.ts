import { IsEnum, IsIn, IsUUID } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

// 给一个已存在的内部用户额外挂 membership（多机构场景）
export class AddMembershipDto {
  @IsUUID()
  organizationId: string;

  // membership 内不允许外部三类角色（那类账号不走 membership 通道）
  @IsEnum(Role)
  @IsIn([Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF])
  role: Role;
}
