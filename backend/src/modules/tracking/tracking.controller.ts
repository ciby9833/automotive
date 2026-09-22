import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TrackingService } from './tracking.service';
import { DriverPositionBatchDto } from './dto/driver-position-batch.dto';
import { ScopeService } from '../../common/scope/scope.service';

// 车架号 / 订单全生命周期轨迹跟踪
@ApiTags('tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService, private readonly scopes: ScopeService) {}

  @Permissions(Permission.TRACKING_VIEW)
  @Get('vin/:vin')
  async findByVin(@Param('vin') vin: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.findByVin(vin, await this.scopes.resolve(user));
  }

  // 合并 OperationLog + WaybillStatusLog 的时间线；按 VIN
  @Permissions(Permission.TRACKING_VIEW)
  @Get('timeline/vin/:vin')
  async timelineByVin(@Param('vin') vin: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.timelineByVin(vin, await this.scopes.resolve(user));
  }

  // 时间线：按订单 id
  @Permissions(Permission.TRACKING_VIEW)
  @Get('timeline/order/:orderId')
  async timelineByOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.timelineByOrderId(orderId, await this.scopes.resolve(user));
  }

  @Permissions(Permission.WAYBILL_SCAN)
  @Post('positions/batch')
  saveDriverPositions(
    @Body() dto: DriverPositionBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trackingService.saveDriverPositionBatch(dto, user);
  }
}
