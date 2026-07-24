import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

// 管理员直接创建承运商账号 (不走邀请码)
// 只允许 role ∈ {CARRIER_STAFF, CARRIER_DRIVER}；service 层再校验一次
export class CreateCarrierUserDto {
  @ApiProperty()
  @IsString()
  @Length(3, 60)
  username: string;

  @ApiProperty()
  @IsString()
  @Length(6, 60)
  password: string;

  @ApiProperty()
  @IsString()
  @Length(1, 60)
  displayName: string;

  @ApiProperty({ enum: [Role.CARRIER_STAFF, Role.CARRIER_DRIVER] })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}
