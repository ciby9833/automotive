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
  /** 客户编号（优先）或名称；留空时用界面上选的默认客户 */
  @IsOptional() @IsString() @MaxLength(120) customer?: string;
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
  /** 派车组（CC1 / CC2 …）：同组的车同一拖车类型、同一物流商，一组一趟车 */
  @IsOptional() @IsString() @MaxLength(40) group?: string;
  @IsOptional() @IsString() @MaxLength(20) plannedPickupDate?: string;
  @IsOptional() @IsString() @MaxLength(20) plannedDeliveryDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}

export class ImportTransportDto {
  /** 默认客户：行里没填 Customer 时用它；整个文件都填了客户则可以不传 */
  @IsOptional() @IsUUID() customerId?: string;
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

export class SetGroupDto extends LineIdsDto {
  /** 组号（CC1 …）；空字符串表示取消分组 */
  @IsOptional() @IsString() @MaxLength(40) group?: string;
}

/** 按组确认：只定物流商即可，司机和拖车可以之后再指派（两者要么都给，要么都不给） */
export class BatchTripItemDto extends LineIdsDto {
  @IsUUID() carrierId: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
}

export class BatchTripsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchTripItemDto)
  items: BatchTripItemDto[];
}

/** 更换（提货前）或更正（提货后）这趟车的物流商、司机、拖车 */
export class ReassignTripDto {
  @IsUUID() carrierId: string;
  @IsUUID() driverId: string;
  @IsUUID() vehicleId: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
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

/** 内部人员补录运输状态：强制提货 / 强制签收，可附图片 */
export class ForceStatusDto extends LineIdsDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoKeys?: string[];
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
  // 门店与区域二选一：门店价优先，区域价兜底
  @IsOptional() @IsUUID() destinationRegionId?: string;
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

/** 运输明细的查询条件：列表和导出共用 */
export class LineQueryDto {
  @IsOptional() @IsString() @MaxLength(200) status?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() carrierId?: string;
  @IsOptional() @IsUUID() originId?: string;
  @IsOptional() @IsUUID() destinationId?: string;
  @IsOptional() @IsIn(TOW_TYPES) towType?: string;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsUUID() groupBatchId?: string;
  /** 组号，可多个，逗号分隔 */
  @IsOptional() @IsString() @MaxLength(500) group?: string;
  @IsOptional() @IsIn(['orderCreated', 'plannedPickup', 'plannedDelivery', 'pickedUp', 'delivered']) dateField?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** 带上时间线和回单（运输明细页用） */
  @IsOptional() @IsIn(['true', 'false']) timeline?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
  /** 导出表头语言 */
  @IsOptional() @IsIn(['zh', 'en', 'id']) lang?: 'zh' | 'en' | 'id';
  /** 导出是否嵌签收照片（默认嵌；调度明细导出传 false） */
  @IsOptional() @IsIn(['true', 'false']) photos?: string;
}

/** 需求单列表 / 导出的查询条件 */
export class OrderQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['OPEN', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsIn(['zh', 'en', 'id']) lang?: 'zh' | 'en' | 'id';
}

/** 趟次列表 / 导出的查询条件 */
export class TripQueryDto {
  @IsOptional() @IsString() @MaxLength(200) status?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['true', 'false']) unassigned?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsIn(['zh', 'en', 'id']) lang?: 'zh' | 'en' | 'id';
}
