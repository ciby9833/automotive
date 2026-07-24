import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

// 只允许改姓名和邮箱；username 是登录凭证不允许改；role 一旦定了不允许改（避免权限漂移）
// 想改角色需要删账号重建
export class UpdateCarrierUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  displayName?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}
