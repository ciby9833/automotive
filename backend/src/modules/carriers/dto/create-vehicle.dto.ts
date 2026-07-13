import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VehicleTowType } from '../../../common/enums/order-type.enum';

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @ApiProperty({ enum: VehicleTowType, required: false })
  @IsOptional()
  @IsEnum(VehicleTowType)
  towType?: VehicleTowType;
}
