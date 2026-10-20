import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';
import { Actor, TransportAccess } from './transport.access';
import { TransportOrdersService } from './transport-orders.service';
import { TransportTripsService } from './transport-trips.service';

/** 带签收照片的明细一次最多导多少台：图片要逐张取原图压缩，量太大请按日期分批导 */
export const EXPORT_MAX_LINES = 1000;
/** 不带图片的导出（需求单、趟次、调度明细）一次最多多少行 */
export const EXPORT_MAX_ROWS = 5000;
const PHOTOS_PER_LINE = 3;
const THUMB = { width: 200, height: 150 };

type Lang = 'zh' | 'en' | 'id';
type LineFilters = Parameters<TransportOrdersService['lines']>[1];
type OrderFilters = Parameters<TransportOrdersService['list']>[1];
type TripFilters = Parameters<TransportTripsService['list']>[1];
type Paged = { items: unknown[]; total: number };

const HEADERS: Record<string, [string, string, string]> = {
  order: ['需求单号', 'Order no.', 'No. pesanan'],
  requestNo: ['客户订单号', 'Customer ref.', 'No. pelanggan'],
  customer: ['客户', 'Customer', 'Pelanggan'],
  vin: ['VIN', 'VIN', 'VIN'],
  origin: ['始发地', 'Origin', 'Asal'],
  destination: ['目的地', 'Destination', 'Tujuan'],
  carrier: ['供应商', 'Vendor', 'Vendor'],
  towType: ['拖车类型', 'Armada', 'Armada'],
  trip: ['趟次号', 'Trip no.', 'No. trip'],
  status: ['状态', 'Status', 'Status'],
  orderAt: ['需求单时间', 'Order created', 'Pesanan dibuat'],
  allocatedAt: ['分配物流商', 'Vendor assigned', 'Vendor ditetapkan'],
  dispatchedAt: ['派车', 'Dispatched', 'Ditugaskan'],
  pickedUpAt: ['提货', 'Picked up', 'Diambil'],
  departedAt: ['发车', 'Departed', 'Berangkat'],
  deliveredAt: ['签收', 'Delivered', 'Diterima'],
  photos: ['签收照片', 'Delivery photos', 'Foto terima'],
  pod: ['回单', 'POD', 'POD'],
  plannedPickup: ['计划提货', 'Planned pickup', 'Rencana ambil'],
  plannedDelivery: ['计划到达', 'Planned delivery', 'Rencana tiba'],
  source: ['来源', 'Source', 'Sumber'],
  cars: ['台数', 'Cars', 'Unit'],
  delivered: ['已签收', 'Delivered', 'Diterima'],
  moving: ['运输中', 'In transit', 'Dalam perjalanan'],
  unallocated: ['待分配', 'To assign', 'Belum dialokasi'],
  missingVin: ['待补 VIN', 'VIN pending', 'VIN belum ada'],
  remark: ['备注', 'Remark', 'Catatan'],
  createdAt: ['创建时间', 'Created', 'Dibuat'],
  trailer: ['拖车', 'Trailer', 'Trailer'],
  driver: ['司机', 'Driver', 'Sopir'],
  phone: ['电话', 'Phone', 'Telepon'],
  capacity: ['载量', 'Capacity', 'Kapasitas'],
  loaded: ['已装', 'Loaded', 'Dimuat'],
  group: ['组', 'Group', 'Grup'],
  completedAt: ['完成', 'Completed', 'Selesai'],
};
const ORDER_STATUS: Record<string, [string, string, string]> = {
  OPEN: ['进行中', 'Open', 'Berjalan'],
  COMPLETED: ['已完成', 'Completed', 'Selesai'],
  CANCELLED: ['已取消', 'Cancelled', 'Dibatalkan'],
};
const TRIP_STATUS: Record<string, [string, string, string]> = {
  PLANNED: ['待提货', 'Planned', 'Direncanakan'],
  LOADING: ['装车中', 'Loading', 'Memuat'],
  IN_TRANSIT: ['运输中', 'In transit', 'Dalam perjalanan'],
  COMPLETED: ['已完成', 'Completed', 'Selesai'],
  CANCELLED: ['已取消', 'Cancelled', 'Dibatalkan'],
};
const STATUS: Record<string, [string, string, string]> = {
  UNALLOCATED: ['待分配', 'To assign', 'Belum dialokasi'],
  ALLOCATED: ['待派车', 'To dispatch', 'Menunggu trip'],
  DISPATCHED: ['待提货', 'To pick up', 'Menunggu ambil'],
  PICKED_UP: ['已装车', 'Loaded', 'Dimuat'],
  IN_TRANSIT: ['运输中', 'In transit', 'Dalam perjalanan'],
  DELIVERED: ['已签收', 'Delivered', 'Diterima'],
  CLOSED: ['已关闭', 'Closed', 'Ditutup'],
  CANCELLED: ['已取消', 'Cancelled', 'Dibatalkan'],
};

interface ExportLine {
  organization_id: string;
  order_code: string;
  customer_request_no: string;
  customer_name: string;
  vin: string | null;
  origin_code: string | null;
  origin_name: string;
  destination_code: string | null;
  destination_name: string;
  carrier_name: string | null;
  tow_type: string | null;
  trip_code: string | null;
  status: string;
  order_created_at: Date | null;
  allocated_at: Date | null;
  dispatched_at: Date | null;
  picked_up_at: Date | null;
  departed_at: Date | null;
  delivered_at: Date | null;
  delivery_photos: string[];
  pod_documents: { key: string; name: string }[];
}

/**
 * 运输明细导出：按当前筛选生成 Excel，签收照片压成缩略图嵌在表里（预览链接只有 15 分钟，放链接会过期）。
 * 时间按各机构的运营时区显示。
 */
@Injectable()
export class TransportExportService {
  private readonly logger = new Logger(TransportExportService.name);

  constructor(
    private readonly access: TransportAccess,
    private readonly orders: TransportOrdersService,
    private readonly trips: TransportTripsService,
    private readonly storage: StorageService,
  ) {}

  /** photos=false 时不嵌照片（调度明细用），上限按普通导出算 */
  async lines(
    a: Actor,
    filters: Omit<LineFilters, 'page' | 'pageSize' | 'timeline'>,
    lang: Lang,
    photos = true,
  ): Promise<Buffer> {
    const max = photos ? EXPORT_MAX_LINES : EXPORT_MAX_ROWS;
    const page: Paged = await this.orders.lines(a, {
      ...filters,
      timeline: true,
      page: 1,
      pageSize: max,
    });
    this.assertSize(page.total, max);
    const rows = page.items as ExportLine[];
    const i = lang === 'zh' ? 0 : lang === 'id' ? 2 : 1;
    const fmt = await this.formatters(rows.map((r) => r.organization_id));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Lines');
    const textCols = [
      ['order', 16],
      ['requestNo', 16],
      ['customer', 18],
      ['vin', 20],
      ['origin', 24],
      ['destination', 24],
      ['carrier', 18],
      ['towType', 9],
      ['trip', 15],
      ['status', 10],
      ['orderAt', 17],
      ['allocatedAt', 17],
      ['dispatchedAt', 17],
      ['pickedUpAt', 17],
      ['departedAt', 17],
      ['deliveredAt', 17],
      ['pod', 24],
    ] as const;
    ws.columns = [
      ...textCols.map(([k, width]) => ({ header: HEADERS[k][i], width })),
      ...Array.from({ length: photos ? PHOTOS_PER_LINE : 0 }, (_, n) => ({
        header: `${HEADERS.photos[i]} ${n + 1}`,
        width: 29,
      })),
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
    const photoCol = textCols.length; // 0-based 列号

    rows.forEach((r) => {
      const at = fmt(r.organization_id);
      const row = ws.addRow([
        r.order_code,
        r.customer_request_no,
        r.customer_name,
        r.vin ?? '',
        [r.origin_code, r.origin_name].filter(Boolean).join(' '),
        [r.destination_code, r.destination_name].filter(Boolean).join(' '),
        r.carrier_name ?? '',
        r.tow_type ?? '',
        r.trip_code ?? '',
        STATUS[r.status]?.[i] ?? r.status,
        at(r.order_created_at),
        at(r.allocated_at),
        at(r.dispatched_at),
        at(r.picked_up_at),
        at(r.departed_at),
        at(r.delivered_at),
        (r.pod_documents ?? []).map((d) => d.name).join('\n'),
      ]);
      row.alignment = { vertical: 'middle', wrapText: true };
      if (photos && r.delivery_photos?.length)
        row.height = THUMB.height * 0.78 + 6; // 磅 ≈ 像素 × 0.75
    });
    if (!photos) return Buffer.from(await wb.xlsx.writeBuffer());

    // 缩略图并发取图，单张失败只留空，不影响整张表
    const jobs = rows.flatMap((r, rowIndex) =>
      (r.delivery_photos ?? [])
        .slice(0, PHOTOS_PER_LINE)
        .map((key, n) => ({ key, rowIndex, n })),
    );
    let failed = 0;
    await pool(jobs, 4, async ({ key, rowIndex, n }) => {
      const thumb = await this.thumbnail(key);
      if (!thumb) {
        failed += 1;
        return;
      }
      const id = wb.addImage({
        buffer: thumb.buffer as unknown as ExcelJS.Buffer,
        extension: 'jpeg',
      });
      ws.addImage(id, {
        tl: { col: photoCol + n + 0.05, row: rowIndex + 1 + 0.05 },
        ext: { width: thumb.width, height: thumb.height },
        editAs: 'oneCell',
      });
    });
    if (failed)
      this.logger.warn(`运输明细导出：${failed} 张签收照片读取失败，已留空`);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** 需求单导出：条件与列表一致 */
  async orderList(
    a: Actor,
    filters: Omit<OrderFilters, 'page' | 'pageSize'>,
    lang: Lang,
  ): Promise<Buffer> {
    const page: Paged = await this.orders.list(a, {
      ...filters,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
    });
    this.assertSize(page.total, EXPORT_MAX_ROWS);
    const rows = page.items as Record<string, string | number | Date | null>[];
    const i = lang === 'zh' ? 0 : lang === 'id' ? 2 : 1;
    const fmt = await this.formatters(
      rows.map((r) => r.organization_id as string),
    );
    return this.sheet(
      'Orders',
      i,
      [
        ['order', 16],
        ['customer', 18],
        ['requestNo', 18],
        ['plannedPickup', 12],
        ['plannedDelivery', 12],
        ['status', 10],
        ['cars', 8],
        ['delivered', 8],
        ['moving', 8],
        ['unallocated', 8],
        ['missingVin', 9],
        ['source', 8],
        ['createdAt', 17],
        ['remark', 28],
      ],
      rows.map((r) => [
        r.code,
        r.customer_name,
        r.customer_request_no,
        r.planned_pickup_date ?? '',
        r.planned_delivery_date ?? '',
        ORDER_STATUS[r.status as string]?.[i] ?? r.status,
        r.line_count,
        r.delivered_count,
        r.moving_count,
        r.unallocated_count,
        r.missing_vin_count,
        r.source,
        fmt(r.organization_id as string)(r.created_at as Date),
        r.remark ?? '',
      ]),
    );
  }

  /** 趟次导出：条件与列表一致 */
  async tripList(
    a: Actor,
    filters: Omit<TripFilters, 'page' | 'pageSize'>,
    lang: Lang,
  ): Promise<Buffer> {
    const page: Paged = await this.trips.list(a, {
      ...filters,
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
    });
    this.assertSize(page.total, EXPORT_MAX_ROWS);
    const rows = page.items as Record<string, string | number | Date | null>[];
    const i = lang === 'zh' ? 0 : lang === 'id' ? 2 : 1;
    const fmt = await this.formatters(
      rows.map((r) => r.organization_id as string),
    );
    return this.sheet(
      'Trips',
      i,
      [
        ['trip', 15],
        ['status', 10],
        ['carrier', 18],
        ['trailer', 13],
        ['towType', 9],
        ['driver', 16],
        ['phone', 15],
        ['capacity', 7],
        ['cars', 7],
        ['loaded', 7],
        ['delivered', 8],
        ['origin', 26],
        ['destination', 30],
        ['customer', 18],
        ['group', 10],
        ['createdAt', 17],
        ['departedAt', 17],
        ['completedAt', 17],
      ],
      rows.map((r) => {
        const at = fmt(r.organization_id as string);
        return [
          r.code,
          TRIP_STATUS[r.status as string]?.[i] ?? r.status,
          r.carrier_name,
          r.plate_number ?? '',
          r.tow_type,
          r.driver_name ?? '',
          r.driver_phone ?? '',
          r.capacity,
          r.line_count,
          r.loaded_count,
          r.delivered_count,
          r.origins ?? '',
          r.destinations ?? '',
          r.customers ?? '',
          r.dispatch_groups ?? '',
          at(r.created_at as Date),
          at(r.departed_at as Date),
          at(r.completed_at as Date),
        ];
      }),
    );
  }

  private assertSize(total: number, max: number) {
    if (total > max)
      throw new BadRequestException(
        `当前筛选有 ${total} 条，一次最多导出 ${max} 条，请缩小日期范围或增加筛选条件`,
      );
    if (!total) throw new BadRequestException('当前筛选没有数据');
  }

  private async sheet(
    name: string,
    i: number,
    columns: [keyof typeof HEADERS, number][],
    rows: unknown[][],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map(([k, width]) => ({
      header: HEADERS[k][i],
      width,
    }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    ws.addRows(rows);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async thumbnail(
    key: string,
  ): Promise<{ buffer: Buffer; width: number; height: number } | null> {
    try {
      const { stream } = await this.storage.getObjectStream(key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>)
        chunks.push(Buffer.from(chunk));
      const { data, info } = await sharp(Buffer.concat(chunks))
        .rotate()
        .resize({ ...THUMB, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height };
    } catch {
      return null;
    }
  }

  /** 按机构运营时区格式化时间 */
  private async formatters(orgIds: string[]) {
    const ids = [...new Set(orgIds)];
    const rows = await this.access.db.query<
      { organization_id: string; timezone: string }[]
    >(
      'SELECT organization_id, timezone FROM organization_operating_policies WHERE organization_id = ANY($1::uuid[])',
      [ids],
    );
    const zones = new Map(rows.map((r) => [r.organization_id, r.timezone]));
    const cache = new Map<string, Intl.DateTimeFormat>();
    return (orgId: string) => {
      const tz = zones.get(orgId) ?? 'UTC';
      let f = cache.get(tz);
      if (!f) {
        f = new Intl.DateTimeFormat('sv-SE', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        cache.set(tz, f);
      }
      const fmt = f;
      return (v: Date | string | null) => (v ? fmt.format(new Date(v)) : '');
    };
  }
}

async function pool<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}
