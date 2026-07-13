import { IsUUID } from 'class-validator';

// 场内移位入参：把 fromSlot 上的车移到 toSlot；两 slot 必须同一 yard
export class MoveSlotDto {
  @IsUUID()
  fromSlotId: string;

  @IsUUID()
  toSlotId: string;
}
