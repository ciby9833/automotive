import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// 分派司机/拖车。承运商开单后由 CARRIER_STAFF 补录，也可以由 ORG_ADMIN 直接指派
// driverId / vehicleId 传 null 表示清空当前值
export class AssignWaybillDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  driverId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;
}
