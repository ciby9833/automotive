import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CarrierType } from '../../../common/enums/carrier-type.enum';
import { PartnerStatus } from '../../../common/enums/partner-status.enum';

// 只允许改主数据；organizationId 不允许改（跨机构迁移会破坏历史订单归属，需另外做迁移动作）
export class UpdateCarrierDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  shortName?: string | null;

  @ApiProperty({ required: false, enum: CarrierType })
  @IsOptional()
  @IsEnum(CarrierType)
  type?: CarrierType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  contactName?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  contactPhone?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  quotationNote?: string | null;
}

export class UpdateCarrierStatusDto {
  @ApiProperty({ enum: PartnerStatus })
  @IsEnum(PartnerStatus)
  status: PartnerStatus;
}
