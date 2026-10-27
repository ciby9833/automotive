import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { VehicleTowType } from '../../../common/enums/order-type.enum';

export class UpdateVehicleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  plateNumber?: string;

  // 可以改类型，但不能清空（IsOptional 会放过 null，这里只在没传时跳过校验）
  @ApiProperty({ enum: VehicleTowType, required: false })
  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(VehicleTowType)
  towType?: VehicleTowType;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  capacity?: number | null;
}
