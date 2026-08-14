import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AppPlatform } from '../entities/app-release.entity';

const toOptionalInteger = ({ value }: { value: unknown }) =>
  value === '' || value === undefined || value === null
    ? undefined
    : Number(value);

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export class PublishAppReleaseDto {
  @IsOptional()
  @IsEnum(AppPlatform)
  platform: AppPlatform = AppPlatform.ANDROID;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  versionName?: string;

  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  versionCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  releaseNotes?: string;

  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  minimumSupportedVersionCode?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  forceUpdate = false;
}
