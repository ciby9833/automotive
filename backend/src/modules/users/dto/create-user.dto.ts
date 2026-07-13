import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

// 内部账号创建入口：必须给一个初始机构+角色形成第一条 membership。
// 外部账号(CARRIER_STAFF/CARRIER_DRIVER/CUSTOMER) 走邀请码注册，不允许经此接口创建。
export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  displayName: string;

  // 只允许创建内部三种角色，外部角色的账号必须走邀请码
  @ApiProperty({ enum: [Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF] })
  @IsEnum(Role)
  @IsIn([Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF])
  role: Role;

  // 初始所属机构：任何内部账号都必须挂在至少一个 org 节点上
  @ApiProperty()
  @IsUUID()
  organizationId: string;

  // YARD_STAFF 必填：绑定的场地 id
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  scopeYardId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}
