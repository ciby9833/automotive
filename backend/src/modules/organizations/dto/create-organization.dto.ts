import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Currency } from '../../../common/enums/currency.enum';

export class CreateOrganizationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  defaultCurrency: Currency;

  // 不填即为根节点(HQ)；非根机构必须指定父节点
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
