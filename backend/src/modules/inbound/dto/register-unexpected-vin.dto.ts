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

// 到仓的车不在任何入库订单里 → 场地临时登记：
//   - 客户 (哪家的车，方便挂到该客户的"散车"订单)
//   - 车辆基本信息 (品牌/车型/颜色/发动机号)
//   - 目的库位 (slot 或 zone，与 InboundScanDto 语义一致)
//   - 入库存证照片 (必填)
// 后端会在同一事务里"找/建散车订单 → 挂 VIN → 走入库扫描" 一步完成
export class RegisterUnexpectedVinDto {
  @ApiProperty()
  @IsString()
  @Length(8, 32)
  vin: string;

  @ApiProperty({ description: '车主客户 id' })
  @IsUUID()
  customerId: string;

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

  // 库位指定：slotCode 手动、zoneCode 自动 二选一
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  slotCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zoneCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  inboundBatchId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  vehicleCheckInfo?: Record<string, string | number>;

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
