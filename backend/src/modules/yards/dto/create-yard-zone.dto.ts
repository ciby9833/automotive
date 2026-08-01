import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

// Zone code 约定不包含 '-'（否则解析 'AB6-01-01' 会撞破折号）
const ZONE_CODE_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

export class CreateYardZoneDto {
  @ApiProperty({ description: 'Zone 编码；只能字母数字下划线，最长 16 字符' })
  @IsString()
  @IsNotEmpty()
  @Matches(ZONE_CODE_PATTERN, {
    message: 'Zone 编码只能包含字母/数字/下划线，最长 16 字符',
  })
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  name?: string;

  @ApiProperty({ description: '排数（每区几条通道，1-999）', default: 1 })
  @IsInt()
  @Min(1)
  @Max(999)
  lineCount: number;

  @ApiProperty({ description: '每排位数（1-999）', default: 1 })
  @IsInt()
  @Min(1)
  @Max(999)
  rowCount: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateYardZoneDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(ZONE_CODE_PATTERN)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, description: '调整后的排数（1-999）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  lineCount?: number;

  @ApiProperty({ required: false, description: '调整后的每排位数（1-999）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  rowCount?: number;
}

// 按 Zone 尺寸批量生成/同步库位（幂等：已存在的 line-row 不重复插）
// 常用姿势：先 create/patch zone 定义 lineCount/rowCount，再调 generate 一次生成 N×M 库位
export class GenerateSlotsByZoneDto {
  @ApiProperty({
    required: false,
    description: '仅生成前 N 排（默认按 zone.lineCount）',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  fromLine?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  toLine?: number;

  @ApiProperty({
    required: false,
    description: '每排生成到第 N 位（默认按 zone.rowCount）',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  toRow?: number;
}
