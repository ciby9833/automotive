import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';
export class RoleScopeDto {
  @IsUUID() organizationId: string;
  @IsOptional()
  @IsEnum(Role)
  @IsIn([Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF])
  type?: Role;
}
export class CreateAccessRoleDto {
  @IsUUID() organizationId: string;
  @IsEnum(Role)
  @IsIn([Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF])
  type: Role;
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions: string[];
}
export class UpdateAccessRoleDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions: string[];
  @IsBoolean() isActive: boolean;
}
