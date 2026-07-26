import { ApiProperty } from '@nestjs/swagger';
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
} from 'class-validator';
import { VehicleTowType } from '../../../common/enums/order-type.enum';

// 开单：以出库导入订单为上下文，从其 VIN 池挑一批开单
// 强约束：所有 VIN 必须属于同一 outboundOrderId + 同一 slot.yard + 同一 dealerCode，
// 且已到仓 + 未开单。始发仓由 VIN 当前库位反推，客户端传值被忽略。
export class PlanWaybillDto {
  // 出库导入订单 id：本次开单的上下文。缺失或与 VIN 归属不匹配都拒绝
  @ApiProperty({ description: '出库导入订单 id（本次开单必须限定于该出库单内）' })
  @IsUUID()
  outboundOrderId: string;

  @ApiProperty({ description: '选定的 OrderVin id 列表' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  orderVinIds: string[];

  // 兼容旧客户端：接受但服务端不信任，最终始发仓一律以 slot.yard 为准
  @ApiProperty({ required: false, deprecated: true, description: '已废弃：始发仓由 VIN 当前库位自动推导' })
  @IsOptional()
  @IsUUID()
  originYardId?: string;

  @ApiProperty({ description: '承运商' })
  @IsUUID()
  carrierId: string;

  @ApiProperty({ required: false, description: '司机 (自营车可空)' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiProperty({ required: false, description: '拖车' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiProperty({ required: false, enum: VehicleTowType })
  @IsOptional()
  @IsEnum(VehicleTowType)
  towType?: VehicleTowType;

  @ApiProperty({ required: false, description: '客户运单号' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  customerWaybillCode?: string;

  @ApiProperty({ required: false, description: '手动指定目的门店 id (覆盖 dealer_code 自动匹配)' })
  @IsOptional()
  @IsUUID()
  destinationDealerId?: string;

  @ApiProperty({ required: false, description: '本次运单收件人（可空，默认取门店联系人）' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @ApiProperty({ required: false, description: '收件人电话（可空，默认取门店电话）' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  recipientPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
