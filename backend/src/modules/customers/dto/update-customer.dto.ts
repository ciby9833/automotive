import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PartnerStatus } from '../../../common/enums/partner-status.enum';

export class UpdateCustomerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

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

export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: PartnerStatus })
  @IsEnum(PartnerStatus)
  status: PartnerStatus;
}
