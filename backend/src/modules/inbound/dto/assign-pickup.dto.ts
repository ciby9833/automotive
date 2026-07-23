import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// HQ / ORG_ADMIN 给入库订单分派提货承运商
// pickupDriverUserId 可选：不填 = 承运商内所有司机共享；填 = 精确到人
// 传 null 表示解除分派 (承运商侧任务池会移出)
export class AssignPickupDto {
  @ApiProperty({ required: false, nullable: true, description: '承运商 id；null 表示解除分派' })
  @IsOptional()
  @IsUUID()
  pickupCarrierId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  pickupDriverUserId?: string | null;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD 计划提货日' })
  @IsOptional()
  @IsDateString()
  plannedPickupDate?: string;
}
