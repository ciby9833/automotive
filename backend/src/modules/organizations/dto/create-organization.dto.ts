import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Currency } from '../../../common/enums/currency.enum';
import { REGION_COUNTRIES } from '../../../database/data/admin-regions';

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,31}$/)
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  defaultCurrency: Currency;

  @ApiProperty({ required: false, enum: REGION_COUNTRIES, description: '所在国家，决定可选的行政区划' })
  @IsOptional()
  @IsIn(REGION_COUNTRIES)
  countryCode?: string | null;

  // 根机构由 seed 创建，业务接口只创建子机构。
  @ApiProperty()
  @IsUUID()
  parentId: string;

  // 新机构必须显式声明运营日历，禁止按国家代码或服务器时区猜测。
  @ApiProperty({ example: 'Asia/Jakarta' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  timezone: string;

  @ApiProperty({ example: '02:00:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  businessDayCutoff: string;
}
