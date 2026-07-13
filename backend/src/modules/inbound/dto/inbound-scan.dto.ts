import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

// 场地业务员扫一台车 + 一个库位
export class InboundScanDto {
  @ApiProperty()
  @IsString()
  @Length(8, 32)
  vin: string;

  @ApiProperty({ description: '库位编码，如 A-01；系统按此定位库位' })
  @IsString()
  @MaxLength(30)
  slotCode: string;

  @ApiProperty({ description: '所属批次 id；不带表示业务员单车临时扫，无批次' })
  @IsOptional()
  @IsUUID()
  inboundBatchId?: string;

  @ApiProperty({
    required: false,
    description: '车检信息 {battery?, mileage?, exterior?}',
  })
  @IsOptional()
  @IsObject()
  vehicleCheckInfo?: Record<string, string | number>;

  // 入库存证必须至少 1 张 — 车损/纠纷时唯一可追溯证据
  @ApiProperty({ description: '入库现场照片，至少 1 张' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoUrls: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class CreateInboundBatchDto {
  @ApiProperty()
  @IsUUID()
  yardId: string;

  @ApiProperty()
  @IsString()
  @Length(1, 60)
  batchCode: string;

  @ApiProperty()
  @IsString()
  arrivedDate: string; // YYYY-MM-DD

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
