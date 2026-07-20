import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// 单台 VIN 装车事件：扫码 + 拍装车照
export class LoadVinDto {
  @ApiProperty({ description: '装车照 storage keys', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photoKeys: string[];

  @ApiProperty({ required: false, description: '备注 (损伤复检异常等)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
