import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VehicleTowType } from '../../../common/enums/order-type.enum';

export class UpdateVehicleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  plateNumber?: string;

  @ApiProperty({ enum: VehicleTowType, required: false, nullable: true })
  @IsOptional()
  @IsEnum(VehicleTowType)
  towType?: VehicleTowType | null;
}
