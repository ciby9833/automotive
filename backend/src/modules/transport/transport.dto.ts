import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TOW_TYPES } from './transport.rules';

/** 手工建单：一行 = 一台车（给 VIN）或一组同路线的数量。 */
export class TransportLineInputDto {
  @IsOptional() @IsString() @MaxLength(32) vin?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) quantity?: number;
  @IsUUID() originId: string;
  @IsUUID() destinationId: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleConfig?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleModel?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleColor?: string;
  @IsOptional() @IsIn(TOW_TYPES) towType?: string;
  @IsOptional() @IsUUID() carrierId?: string;
}

export class CreateTransportOrderDto {
  @IsUUID() customerId: string;
  @IsString() @MinLength(1) @MaxLength(120) customerRequestNo: string;
  @IsOptional() @IsDateString() plannedPickupDate?: string;
  @IsOptional() @IsDateString() plannedDeliveryDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TransportLineInputDto)
  lines: TransportLineInputDto[];
}

/** Excel 原始行：地点、承运商按编码/简称匹配，由后端统一校验并逐行报错。 */
export class TransportImportRowDto {
  @IsInt() @Min(1) row: number;
  @IsString() @MaxLength(120) customerRequestNo: string;
  @IsOptional() @IsString() @MaxLength(32) vin?: string;
  @IsOptional() @IsString() @MaxLength(10) quantity?: string;
  @IsString() @MaxLength(120) origin: string;
  @IsString() @MaxLength(120) dealer: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleConfig?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleModel?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleColor?: string;
  @IsOptional() @IsString() @MaxLength(30) armada?: string;
  @IsOptional() @IsString() @MaxLength(120) vendor?: string;
  @IsOptional() @IsString() @MaxLength(20) plannedPickupDate?: string;
  @IsOptional() @IsString() @MaxLength(20) plannedDeliveryDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}

export class ImportTransportDto {
  @IsUUID() customerId: string;
  @IsBoolean() dryRun: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TransportImportRowDto)
  rows: TransportImportRowDto[];
}

export class ReasonDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}

export class LineVinItemDto {
  @IsUUID() lineId: string;
  @IsString() @MaxLength(32) vin: string;
}
export class SupplementVinsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => LineVinItemDto)
  items: LineVinItemDto[];
}

export class UpdateLineDto {
  @IsOptional() @IsString() @MaxLength(32) vin?: string | null;
  @IsOptional() @IsString() @MaxLength(120) vehicleConfig?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleModel?: string;
  @IsOptional() @IsString() @MaxLength(120) vehicleColor?: string;
}

export class LineIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  lineIds: string[];
}

export class AllocateLinesDto extends LineIdsDto {
  @IsUUID() carrierId: string;
  @IsIn(TOW_TYPES) towType: string;
}

export class CancelLinesDto extends LineIdsDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}

export class RemoveTripLinesDto extends LineIdsDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class CreateTripDto extends LineIdsDto {
  @IsUUID() carrierId: string;
  @IsUUID() driverId: string;
  @IsUUID() vehicleId: string;
}

export class PickupScanDto {
  @IsString() @MinLength(1) @MaxLength(32) vin: string;
  @IsOptional() @IsUUID() lineId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoKeys?: string[];
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}

export class SignScanDto {
  @IsString() @MinLength(1) @MaxLength(32) vin: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoKeys?: string[];
}

export class RecordExceptionDto {
  @IsIn(['DAMAGE', 'REFUSED', 'OTHER']) type: string;
  @IsOptional() @IsString() @MaxLength(32) vin?: string;
  @IsString() @MinLength(1) @MaxLength(2000) note: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoKeys?: string[];
}

export class ResolveExceptionDto {
  @IsIn(['BIND', 'ADD', 'REJECT']) decision: 'BIND' | 'ADD' | 'REJECT';
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  /** BIND：顶替或填入本趟次的这行明细 */
  @IsOptional() @IsUUID() lineId?: string;
  /** ADD：作为追加车辆加到这张需求单 */
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() originId?: string;
  @IsOptional() @IsUUID() destinationId?: string;
}

export class TariffDto {
  @IsIn(['RECEIVABLE', 'PAYABLE']) side: 'RECEIVABLE' | 'PAYABLE';
  @IsUUID() customerId: string;
  @IsOptional() @IsUUID() carrierId?: string;
  @IsUUID() originId: string;
  @IsOptional() @IsUUID() destinationId?: string;
  @IsOptional() @IsString() @MaxLength(120) destinationRegion?: string;
  @IsIn(TOW_TYPES) towType: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) price: number;
  @IsDateString() validFrom: string;
  @IsOptional() @IsDateString() validTo?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}

export class RecalculateDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsBoolean() includeManual?: boolean;
}

export class AdjustChargeDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) amount: number;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}

export class ChargeIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  ids: string[];
}
