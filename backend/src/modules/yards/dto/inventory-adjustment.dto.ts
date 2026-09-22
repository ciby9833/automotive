import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
export class InventoryReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
export class InventoryAdjustmentDto extends InventoryReasonDto {
  @IsUUID() yardId: string;
  @IsString() @IsNotEmpty() vin: string;
  @IsIn(['IN', 'OUT']) direction: 'IN' | 'OUT';
  @IsString() @IsNotEmpty() @MaxLength(100) reference: string;
  @IsOptional() @IsUUID() slotId?: string;
  @IsOptional() @IsDateString() enteredAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  photoUrls?: string[];
}
