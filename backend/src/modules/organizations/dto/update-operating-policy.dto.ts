import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateOperatingPolicyDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  businessDayCutoff?: string;

  @IsOptional()
  @IsBoolean()
  snapshotEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  longStayDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  lockTimeoutHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  utilizationWarningPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  utilizationCriticalPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expectedArrivalWarningHours?: number;
}
