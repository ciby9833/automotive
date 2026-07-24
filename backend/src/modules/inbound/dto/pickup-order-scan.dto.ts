import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

// 承运商在某个提货任务内扫 VIN
// 关键：允许扫到"不在本任务"的 VIN（工厂常见 —— 装错车队）；
// 默认接受并在响应里回 outOfOrder=true；App 侧可传 allowOutOfOrder=false 强校验
export class PickupOrderScanDto {
  @ApiProperty()
  @IsString()
  @Length(1, 32)
  vin: string;

  @ApiProperty({
    required: false,
    description: '默认 true：允许扫到不属本任务的 VIN 并接受；false 则严格校验',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowOutOfOrder?: boolean;

  @ApiProperty({ required: false, description: '实际提货地点 (港口/工厂)；空则用订单 originText' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiProperty({ required: false, description: '提货 GPS 纬度，由 App 无感采集' })
  @IsOptional()
  @IsLatitude()
  pickupLatitude?: number;

  @ApiProperty({ required: false, description: '提货 GPS 经度，由 App 无感采集' })
  @IsOptional()
  @IsLongitude()
  pickupLongitude?: number;

  @ApiProperty({ required: false, description: '车损/纠纷存证照片' })
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
