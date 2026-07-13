import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ScanAction } from '../../../common/enums/waybill-status.enum';

// 移动端/JFS扫码通用请求体：先按VIN定位待执行的运单行，再执行状态流转
export class ScanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vin: string;

  @ApiProperty({ enum: ScanAction })
  @IsEnum(ScanAction)
  action: ScanAction;

  @ApiProperty({
    required: false,
    description: '发起扫码操作的场地ID，用于场地权限校验',
  })
  @IsOptional()
  @IsString()
  yardId?: string;

  @ApiProperty({
    required: false,
    description: '电量/里程/外观情况等车辆检查记录',
  })
  @IsOptional()
  @IsObject()
  vehicleCheckInfo?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  attachmentUrls?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}
