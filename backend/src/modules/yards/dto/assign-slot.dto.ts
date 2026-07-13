import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignSlotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  vin: string;
}
