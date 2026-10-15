import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Currency } from '../../../common/enums/currency.enum';
import { REGION_COUNTRIES } from '../../../database/data/admin-regions';

export class UpdateOrganizationDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,31}$/)
  code?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(Currency)
  defaultCurrency?: Currency;

  @IsOptional()
  @IsIn(REGION_COUNTRIES)
  countryCode?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  parentId?: string;
}

export class UpdateOrganizationStatusDto {
  @IsBoolean()
  isActive: boolean;
}
