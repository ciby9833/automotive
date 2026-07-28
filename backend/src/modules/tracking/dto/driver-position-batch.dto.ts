import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DriverPositionPointDto {
  @ApiProperty({ description: '客户端采集时间，ISO timestamp' })
  @IsDateString()
  capturedAt: string;

  @ApiProperty({ required: false, description: '运输中位置关联的 waybill id' })
  @IsOptional()
  @IsUUID()
  waybillId?: string;

  @ApiProperty({ required: false, description: '提货中位置关联的 inbound order id' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vin?: string;

  @ApiProperty()
  @IsLatitude()
  latitude: number;

  @ApiProperty()
  @IsLongitude()
  longitude: number;

  @ApiProperty({ required: false, description: '定位精度，米' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracy?: number;

  @ApiProperty({ required: false, description: '速度，米/秒' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  speed?: number;

  @ApiProperty({ required: false, description: '方向，0-360' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiProperty({ required: false, description: '电量 0-1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  batteryLevel?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isCharging?: boolean;

  @ApiProperty({ required: false, description: 'android-fused / manual 等' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}

export class DriverPositionBatchDto {
  @ApiProperty({ type: [DriverPositionPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DriverPositionPointDto)
  positions: DriverPositionPointDto[];
}
