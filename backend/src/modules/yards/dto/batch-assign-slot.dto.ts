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
  // 只做 lookup 不新建 VIN；不匹配的行会作为 skipped 返回。
  // 长度限制放宽以适配初始化时的临时/短编码测试
  @ApiProperty()
  @IsString()
  @Length(1, 32)
  vin: string;

  @ApiProperty()
  @IsString()
  @Length(1, 30)
  slotCode: string;
}

// 场内批量分配库位 (初始化 / 大规模移位)
// 场景：go-live 时物理车辆已在场地，一次性把 (VIN, TargetSlot) 对入库
// 也支持已入库 VIN 的批量移位 (释放旧 slot → 占新 slot)
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
