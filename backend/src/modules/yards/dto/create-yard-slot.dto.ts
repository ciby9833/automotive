import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateYardSlotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  row?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  slotNo?: string;
}
