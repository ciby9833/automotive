import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { VehicleTowType } from '../../../common/enums/order-type.enum';

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  // 拖车类型必填：纯运输派车、载量默认值都依赖它
  @ApiProperty({ enum: VehicleTowType })
  @IsEnum(VehicleTowType)
  towType: VehicleTowType;

  @ApiProperty({ required: false, description: '载量（台），为空按拖车类型默认' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  capacity?: number;
}
