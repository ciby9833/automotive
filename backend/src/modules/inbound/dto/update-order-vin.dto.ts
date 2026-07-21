import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// 修正客户 Excel 里的字段错误 (仅 EXPECTED 状态可改)
// 不允许改 vin 本身：VIN 是业务主键，改就是"换车"，用删+新增
export class UpdateOrderVinDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  motorNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  dealerCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dealerName?: string;
}
