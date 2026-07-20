import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// 整单启运出闸：校验所有 VIN 已 loaded → 释放 slot → 状态翻 IN_TRANSIT
export class DepartWaybillDto {
  @ApiProperty({ required: false, description: '整车合影 (拖车+全部车辆)', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  gatePhotoKeys?: string[];

  @ApiProperty({ required: false, description: '出闸备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
