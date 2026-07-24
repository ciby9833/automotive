import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
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

  @ApiProperty({ required: false, description: '提货 GPS 纬度，由 App 无感采集' })
  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @ApiProperty({ required: false, description: '提货 GPS 经度，由 App 无感采集' })
  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

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
