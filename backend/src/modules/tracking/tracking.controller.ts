import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TrackingService } from './tracking.service';

// 车架号 / 订单全生命周期轨迹跟踪
@ApiTags('tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('vin/:vin')
  findByVin(@Param('vin') vin: string) {
    return this.trackingService.findByVin(vin);
  }

  // 合并 OperationLog + WaybillStatusLog 的时间线；按 VIN
  @Get('timeline/vin/:vin')
  timelineByVin(@Param('vin') vin: string) {
    return this.trackingService.timelineByVin(vin);
  }

  // 时间线：按订单 id
  @Get('timeline/order/:orderId')
  timelineByOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.trackingService.timelineByOrderId(orderId);
  }
}
