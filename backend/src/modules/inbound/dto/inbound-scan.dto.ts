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

// 场地业务员扫一台车。slotId 精确指定、zoneId 自动分配，二选一。
export class InboundScanDto {
  @ApiProperty()
  @IsString()
  @Length(8, 32)
  vin: string;

  @ApiProperty({
    required: false,
    description: '精确库位 id；手动模式必填',
  })
  @IsOptional()
  @IsUUID()
  slotId?: string;

  @ApiProperty({
    required: false,
    description: '区域 id；自动模式必填。系统按同 model+color 相邻优先挑空位',
  })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

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
