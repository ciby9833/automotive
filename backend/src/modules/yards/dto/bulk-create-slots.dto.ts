import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateYardSlotDto } from './create-yard-slot.dto';

// 批量创建库位入参：Excel 导入 / 网格生成器都走这个接口
export class BulkCreateSlotsDto {
  @ApiProperty({ type: [CreateYardSlotDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => CreateYardSlotDto)
  slots: CreateYardSlotDto[];
}
