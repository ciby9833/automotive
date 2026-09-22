import {
  IsBoolean,
  IsInt,
  IsNumber,
  ValidateIf,
  IsString,
  IsNotEmpty,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateOperatingPolicyDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  businessDayCutoff?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  snapshotEnabled?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(365)
  longStayDays?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(8760)
  lockTimeoutHours?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(1)
  @Max(100)
  utilizationWarningPercent?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(1)
  @Max(100)
  utilizationCriticalPercent?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(720)
  expectedArrivalWarningHours?: number;
}
