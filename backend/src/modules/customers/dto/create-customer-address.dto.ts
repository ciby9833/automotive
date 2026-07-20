import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateCustomerAddressDto {
  @ApiProperty({ required: false, description: 'Dealer Group (集团层级，如 Arista)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dealerGroup?: string;

  @ApiProperty({ description: 'Branch BYD (分店名)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  dealerName: string;

  @ApiProperty({ description: 'Alamat (地址)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty({ required: false, description: '客户系统的门店代码 (Z2410265332)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiProperty({ required: false, description: '地理大区 (GREATER JAKARTA 等)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  contactPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// 批量导入 (BYD 门店 Excel 一次 100 条)：单行结构与 CreateCustomerAddressDto 相同
export class ImportCustomerAddressesDto {
  @ApiProperty({ type: [CreateCustomerAddressDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerAddressDto)
  addresses: CreateCustomerAddressDto[];
}

