import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  TransportType,
  VehicleTowType,
} from '../../../common/enums/order-type.enum';

export class WaybillVinDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vin: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class CreateWaybillDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerWaybillCode?: string;

  @ApiProperty({ enum: TransportType })
  @IsEnum(TransportType)
  transportType: TransportType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  originYardId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  originText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  destinationYardId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  destinationDealerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  carrierId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ enum: VehicleTowType, required: false })
  @IsOptional()
  @IsEnum(VehicleTowType)
  towType?: VehicleTowType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({ type: [WaybillVinDto] })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WaybillVinDto)
  vins: WaybillVinDto[];
}
