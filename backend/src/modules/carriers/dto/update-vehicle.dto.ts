import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
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

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  capacity?: number | null;
}
