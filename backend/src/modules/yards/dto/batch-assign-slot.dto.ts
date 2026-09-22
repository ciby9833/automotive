import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BatchAssignSlotRow {
  // 只查询已有在库 VIN，不新建车辆；不匹配的行作为 failed 返回。
  // 兼容已有历史车辆编码；本接口不承担入库。
  @ApiProperty()
  @IsString()
  @Length(1, 32)
  vin: string;

  @ApiProperty()
  @IsString()
  @Length(1, 30)
  slotCode: string;
}

// 仅对本场地已在库车辆批量移位；入库和盘点调整使用独立入口。
export class BatchAssignSlotDto {
  @ApiProperty({ description: '目标场地 id (所有 VIN 必须都放到该场地)' })
  @IsUUID()
  yardId: string;

  @ApiProperty({ type: [BatchAssignSlotRow], description: '至多 5000 行' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => BatchAssignSlotRow)
  items: BatchAssignSlotRow[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
