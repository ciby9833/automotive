import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

// 外部人员凭邀请码注册的入参
export class RegisterWithInvitationDto {
  @IsString()
  @Length(1, 200)
  token: string;

  @IsString()
  @Length(3, 32)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @Length(1, 60)
  displayName: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
