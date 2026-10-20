import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { REGION_COUNTRIES } from '../../database/data/admin-regions';

export class CreateRegionDto {
  @IsIn(REGION_COUNTRIES) country: string;
  @IsString() @MinLength(1) @MaxLength(150) name: string;
  /** 不填自动生成；建议填官方代码（如 Kepmendagri 32.75） */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9._-]*$/, { message: '代码只能用字母、数字、点、横线' })
  code?: string;
  /** 上级一级区域；不填就是一级区域或独立的自定义区域 */
  @IsOptional() @IsUUID() parentId?: string;
  /** 自定义区域（如 GREATER JAKARTA 这类业务片区），否则是官方行政区划 */
  @IsBoolean() custom: boolean;
}

export class UpdateRegionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9._-]*$/, { message: '代码只能用字母、数字、点、横线' })
  code?: string;
  /** 传 null 表示改成一级 / 独立区域 */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() parentId?:
    string | null;
}
