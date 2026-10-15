import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CUSTOMER_ADDRESS_KINDS,
  type CustomerAddressKind,
} from '../entities/customer-address.entity';

export class CreateCustomerAddressDto {
  @ApiProperty({
    required: false,
    description: 'Dealer Group (集团层级，如 Arista)',
  })
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

  @ApiProperty({ description: '客户系统的门店代码 (Z2410265332)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: '区域 id（标准行政区划）；传 null 清空',
  })
  @IsOptional()
  @IsUUID()
  regionId?: string | null;

  @ApiProperty({
    required: false,
    description: '区域文字（Excel 导入用）：省/县/市的标准名称或代码，后端对到 regionId；同时传 regionId 时以 regionId 为准',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
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

  @ApiProperty({ required: false, enum: CUSTOMER_ADDRESS_KINDS, default: 'STORE' })
  @IsOptional()
  @IsIn(CUSTOMER_ADDRESS_KINDS)
  kind?: CustomerAddressKind;
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
