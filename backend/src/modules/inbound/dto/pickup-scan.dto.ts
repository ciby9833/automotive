import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

// 供应商司机在港口/工厂扫一台车
export class PickupScanDto {
  @ApiProperty()
  @IsString()
  @Length(8, 32)
  vin: string;

  @ApiProperty({ required: false, description: '港口/工厂名，默认取订单里的 originText' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiProperty({ required: false, description: '车损存证照片 (MinIO object keys)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoUrls?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
