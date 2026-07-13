import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { VehicleTowType } from '../../../common/enums/order-type.enum';

// 客户 (BYD) 出库 Excel 里的一行
// 派送目的地按每 VIN 独立存储：一份 Excel 里同一订单可能发往多个经销店
export class ImportOutboundVinRow {
  @ApiProperty()
  @IsString()
  @Length(8, 32)
  vin: string;

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

  // 经销店代码 (BYD 系统里的引用)
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  dealerCode?: string;

  // 经销店名称 (中文/印尼语，前端展示用)
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dealerName?: string;

  @ApiProperty({ required: false, enum: VehicleTowType })
  @IsOptional()
  @IsEnum(VehicleTowType)
  towType?: VehicleTowType;

  // BYD 内部分组编号 (CC1/CC2 等) — 开单时同组车走一张运单
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  groupCode?: string;
}

export class ImportOutboundOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  // 出库场景的"始发仓" = 极兔仓库 (车已在库存里)
  @ApiProperty()
  @IsUUID()
  originYardId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerOrderNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiProperty({ type: [ImportOutboundVinRow] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportOutboundVinRow)
  vins: ImportOutboundVinRow[];
}
