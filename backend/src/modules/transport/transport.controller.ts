import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { Permission } from '../../common/enums/permission.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StorageService } from '../storage/storage.service';
import { TransportAccess } from './transport.access';
import { TransportOrdersService } from './transport-orders.service';
import { TransportTripsService } from './transport-trips.service';
import { TransportFinanceService } from './transport-finance.service';
import {
  AdjustChargeDto,
  AllocateLinesDto,
  CancelLinesDto,
  ChargeIdsDto,
  CreateTransportOrderDto,
  CreateTripDto,
  ImportTransportDto,
  LineIdsDto,
  PickupScanDto,
  ReasonDto,
  RecalculateDto,
  RecordExceptionDto,
  RemoveTripLinesDto,
  ResolveExceptionDto,
  SignScanDto,
  SupplementVinsDto,
  TariffDto,
  UpdateLineDto,
} from './transport.dto';

function paging(page?: string, pageSize?: string, max = 200) {
  const p = Number(page ?? 1);
  const s = Number(pageSize ?? 50);
  if (!Number.isInteger(p) || p < 1 || p > 100000) throw new BadRequestException('页码不正确');
  if (!Number.isInteger(s) || s < 1 || s > max) throw new BadRequestException(`每页 1–${max} 条`);
  return { page: p, pageSize: s };
}

@ApiTags('transport')
@ApiBearerAuth()
@Controller('transport')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HQ_ADMIN, Role.ORG_ADMIN, Role.CARRIER_DRIVER, Role.CARRIER_STAFF, Role.CUSTOMER)
export class TransportController {
  constructor(
    private readonly access: TransportAccess,
    private readonly orders: TransportOrdersService,
    private readonly trips: TransportTripsService,
    private readonly finance: TransportFinanceService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- 需求单
  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('orders')
  async listOrders(
    @CurrentUser() u: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orders.list(await this.access.actor(u), {
      search,
      status,
      customerId,
      ...paging(page, pageSize),
    });
  }

  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('orders/:id')
  async order(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.orders.detail(await this.access.actor(u), id);
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('orders')
  async createOrder(@Body() d: CreateTransportOrderDto, @CurrentUser() u: AuthenticatedUser) {
    return this.orders.create(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('orders/import')
  async importOrders(@Body() d: ImportTransportDto, @CurrentUser() u: AuthenticatedUser) {
    return this.orders.import(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('orders/:id/vins')
  async supplement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SupplementVinsDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.orders.supplementVins(await this.access.actor(u), id, d);
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('orders/:id/cancel')
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReasonDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.orders.cancelOrder(await this.access.actor(u), id, d.reason);
  }

  // ---------------------------------------------------------------- 明细
  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('lines')
  async lines(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
    @Query('carrierId') carrierId?: string,
    @Query('originId') originId?: string,
    @Query('destinationId') destinationId?: string,
    @Query('towType') towType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orders.lines(await this.access.actor(u), {
      status,
      orderId,
      customerId,
      carrierId,
      originId,
      destinationId,
      towType,
      search,
      ...paging(page, pageSize, 500),
    });
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Patch('lines/:id')
  async updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateLineDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.orders.updateLine(await this.access.actor(u), id, d);
  }

  @Permissions(Permission.TRANSPORT_DISPATCH)
  @Post('lines/allocate')
  async allocate(@Body() d: AllocateLinesDto, @CurrentUser() u: AuthenticatedUser) {
    return this.orders.allocate(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('lines/cancel')
  async cancelLines(@Body() d: CancelLinesDto, @CurrentUser() u: AuthenticatedUser) {
    return this.orders.cancelLines(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('lines/:id/close')
  async closeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReasonDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.closeLine(await this.access.actor(u), id, d.reason);
  }

  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('vins/:vin/history')
  async vinHistory(@Param('vin') vin: string, @CurrentUser() u: AuthenticatedUser) {
    return this.orders.vinHistory(await this.access.actor(u), vin);
  }

  // ---------------------------------------------------------------- 趟次
  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('trips')
  async listTrips(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.trips.list(await this.access.actor(u), { status, search, ...paging(page, pageSize) });
  }

  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('trips/:id')
  async trip(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.trips.detail(await this.access.actor(u), id);
  }

  @Permissions(Permission.TRANSPORT_DISPATCH)
  @Post('trips')
  async createTrip(@Body() d: CreateTripDto, @CurrentUser() u: AuthenticatedUser) {
    return this.trips.create(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_DISPATCH)
  @Post('trips/:id/lines')
  async addTripLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: LineIdsDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.addLines(await this.access.actor(u), id, d.lineIds);
  }

  @Permissions(Permission.TRANSPORT_DISPATCH)
  @Post('trips/:id/lines/remove')
  async removeTripLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RemoveTripLinesDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.removeLines(await this.access.actor(u), id, d);
  }

  @Permissions(Permission.TRANSPORT_DISPATCH)
  @Post('trips/:id/cancel')
  async cancelTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReasonDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.cancel(await this.access.actor(u), id, d.reason);
  }

  @Permissions(Permission.TRANSPORT_EXECUTE)
  @Post('trips/:id/pickup')
  async pickup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PickupScanDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.pickup(await this.access.actor(u), id, d);
  }

  @Permissions(Permission.TRANSPORT_EXECUTE)
  @Post('trips/:id/depart')
  async depart(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.trips.depart(await this.access.actor(u), id);
  }

  @Permissions(Permission.TRANSPORT_EXECUTE)
  @Post('trips/:id/sign')
  async sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SignScanDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.sign(await this.access.actor(u), id, d);
  }

  @Permissions(Permission.TRANSPORT_EXECUTE)
  @Post('trips/:id/exceptions')
  async recordException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RecordExceptionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.recordException(await this.access.actor(u), id, d);
  }

  /** POD：按段（起点→终点）上传，PDF 或 JPG，单个最大 20 MB。 */
  @Permissions(Permission.TRANSPORT_EXECUTE)
  @Post('trips/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('originId', ParseUUIDPipe) originId: string,
    @Body('destinationId', ParseUUIDPipe) destinationId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    const actor = await this.access.actor(u);
    await this.trips.assertCanUpload(actor, id, originId, destinationId);
    const pdf = file?.buffer.subarray(0, 5).toString() === '%PDF-';
    const jpg = file?.buffer[0] === 0xff && file?.buffer[1] === 0xd8 && file?.buffer[2] === 0xff;
    if (!file || !((file.mimetype === 'application/pdf' && pdf) || (file.mimetype === 'image/jpeg' && jpg)))
      throw new BadRequestException('请上传 20 MB 以内的 PDF 或 JPG');
    const uploaded = await this.storage.upload(file.buffer, file.originalname, file.mimetype, u);
    try {
      return await this.trips.addDocument(actor, id, originId, destinationId, {
        key: uploaded.key,
        name: file.originalname,
        mime: file.mimetype,
      });
    } catch (e) {
      await this.storage.deleteObject(uploaded.key);
      throw e;
    }
  }

  @Permissions(Permission.TRANSPORT_VIEW)
  @Get('exceptions')
  async exceptions(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.trips.exceptions(await this.access.actor(u), { status, ...paging(page, pageSize) });
  }

  @Permissions(Permission.TRANSPORT_ORDER_MANAGE)
  @Post('exceptions/:id/resolve')
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ResolveExceptionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.trips.resolveException(await this.access.actor(u), id, d);
  }

  // ---------------------------------------------------------------- 报价与费用
  @Permissions(Permission.TRANSPORT_FINANCE_VIEW)
  @Get('tariffs')
  async tariffs(
    @CurrentUser() u: AuthenticatedUser,
    @Query('side') side?: string,
    @Query('customerId') customerId?: string,
    @Query('carrierId') carrierId?: string,
    @Query('originId') originId?: string,
    @Query('activeOn') activeOn?: string,
  ) {
    return this.finance.tariffs(await this.access.actor(u), { side, customerId, carrierId, originId, activeOn });
  }

  @Permissions(Permission.TRANSPORT_FINANCE)
  @Post('tariffs')
  async createTariff(@Body() d: TariffDto, @CurrentUser() u: AuthenticatedUser) {
    return this.finance.saveTariff(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_FINANCE)
  @Patch('tariffs/:id')
  async updateTariff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TariffDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.finance.saveTariff(await this.access.actor(u), d, id);
  }

  @Permissions(Permission.TRANSPORT_FINANCE)
  @Delete('tariffs/:id')
  async deleteTariff(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.finance.deleteTariff(await this.access.actor(u), id);
  }

  @Permissions(Permission.TRANSPORT_FINANCE_VIEW)
  @Get('charges')
  async charges(
    @CurrentUser() u: AuthenticatedUser,
    @Query('side') side?: string,
    @Query('customerId') customerId?: string,
    @Query('carrierId') carrierId?: string,
    @Query('tripId') tripId?: string,
    @Query('vin') vin?: string,
    @Query('status') status?: string,
    @Query('pricing') pricing?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.finance.charges(await this.access.actor(u), {
      side,
      customerId,
      carrierId,
      tripId,
      vin,
      status,
      pricing,
      from,
      to,
      ...paging(page, pageSize, 500),
    });
  }

  @Permissions(Permission.TRANSPORT_FINANCE)
  @Patch('charges/:id')
  async adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AdjustChargeDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.finance.adjust(await this.access.actor(u), id, d);
  }

  @Permissions(Permission.TRANSPORT_FINANCE)
  @Post('charges/confirm')
  async confirm(@Body() d: ChargeIdsDto, @CurrentUser() u: AuthenticatedUser) {
    return this.finance.confirm(await this.access.actor(u), d);
  }

  @Permissions(Permission.TRANSPORT_FINANCE)
  @Post('charges/recalculate')
  async recalculate(@Body() d: RecalculateDto, @CurrentUser() u: AuthenticatedUser) {
    return this.finance.recalculate(await this.access.actor(u), d);
  }
}
