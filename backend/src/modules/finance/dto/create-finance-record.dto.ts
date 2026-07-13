import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { FinanceRecordType } from '../../../common/enums/waybill-status.enum';
import { Currency } from '../../../common/enums/currency.enum';

export class CreateFinanceRecordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  waybillId: string;

  @ApiProperty({ enum: FinanceRecordType })
  @IsEnum(FinanceRecordType)
  type: FinanceRecordType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  carrierId?: string;

  @ApiProperty()
  @IsNumberString()
  amount: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}
