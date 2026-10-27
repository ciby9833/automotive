import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CarrierType } from '../../../common/enums/carrier-type.enum';

export class CreateCarrierDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  // 简称：纯运输 Excel 导入的 Vendor 列按它匹配物流商，机构内不能与别家的简称或全称重复
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  shortName?: string;

  @ApiProperty({ enum: CarrierType, default: CarrierType.EXTERNAL })
  @IsEnum(CarrierType)
  type: CarrierType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({
    required: false,
    description: '用于接收运单分配通知/对账单等系统邮件',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  quotationNote?: string;
}
