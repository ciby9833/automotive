import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  // 新机构必须显式声明运营日历，禁止按国家代码或服务器时区猜测。
  @ApiProperty({ example: 'Asia/Jakarta' })
  @IsString()
  timezone: string;

  @ApiProperty({ example: '02:00:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  businessDayCutoff: string;
}
