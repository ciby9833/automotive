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

// 开单：从库存里选一批 VIN，指定承运商/司机/拖车，生成 Waybill(DELIVERY)
// 后端会：
// 1. 校验每 VIN 都已到仓 (arrivalStatus=ARRIVED) 且未被分配 (isAllocated=false)
// 2. 创建 Waybill(transportType=DELIVERY, orderId=选定 VIN 的订单，若全同订单)
// 3. 复制 VIN 快照到 waybill_vins
// 4. 标记 OrderVin.isAllocated = true
export class PlanWaybillDto {
  @ApiProperty({ description: '选定的 OrderVin id 列表' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  orderVinIds: string[];

  @ApiProperty({ description: '始发场地 (车所在仓)' })
  @IsUUID()
  originYardId: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
