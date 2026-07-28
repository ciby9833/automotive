'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { waybillsApi, Waybill, WaybillStatus } from '@/lib/api/waybills';
import { yardsApi, Yard } from '@/lib/api/yards';
import { carriersApi, Carrier } from '@/lib/api/carriers';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { WaybillDetailDrawer } from '@/components/waybills/WaybillDetailDrawer';
import { AssignWaybillModal } from '@/components/waybills/AssignWaybillModal';
import { canAssignWaybill } from '@/components/waybills/canAssignWaybill';
import { exportRowsToXlsx, formatDateTime } from '@/lib/export/xlsx';

const { RangePicker } = DatePicker;

const STATUS_COLOR: Record<string, string> = {
  NOT_ARRIVED: 'default',
  IN_TRANSIT: 'processing',
  ARRIVED: 'success',
};

// 默认时间范围：当月
function currentMonthRange(): [Dayjs, Dayjs] {
  return [dayjs().startOf('month'), dayjs().endOf('month')];
}

export default function WaybillsPage() {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [yards, setYards] = useState<Yard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [waybillCode, setWaybillCode] = useState('');
  const [customerWaybillCode, setCustomerWaybillCode] = useState('');
  const [vinKeyword, setVinKeyword] = useState('');
  const [status, setStatus] = useState<WaybillStatus | undefined>();
  const [originYardId, setOriginYardId] = useState<string | undefined>();
  const [destinationDealerId, setDestinationDealerId] = useState<string | undefined>();
  const [carrierId, setCarrierId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(
    currentMonthRange(),
  );

  const [detailWaybill, setDetailWaybill] = useState<Waybill | null>(null);
  const [assignTarget, setAssignTarget] = useState<Waybill | null>(null);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const userRole = useAuthStore((s) => s.user?.role);
  const userCarrierId = useAuthStore((s) => s.externalContext?.carrierId);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  useEffect(() => {
    yardsApi.list().then(setYards).catch(() => undefined);
    carriersApi.list().then(setCarriers).catch(() => undefined);
  }, []);

  // 汇总当前所有过滤，供 load 和 export 共用；导出走 all=true 跳过分页
  const currentFilters = () => ({
    organizationId: orgFilter,
    waybillCode: waybillCode.trim() || undefined,
    customerWaybillCode: customerWaybillCode.trim() || undefined,
    vin: vinKeyword.trim() || undefined,
    status,
    originYardId,
    destinationDealerId,
    carrierId,
    dateFrom: dateRange?.[0]?.toISOString(),
    dateTo: dateRange?.[1]?.toISOString(),
  });

  const load = () => {
    setLoading(true);
    waybillsApi
      .list({
        ...currentFilters(),
        page,
        pageSize,
        sortBy,
        sortOrder,
      })
      .then((res) => {
        setWaybills(res.items);
        setTotal(res.total);
      })
      .catch(() => message.error(t('waybills.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeOrgId,
    orgFilter,
    status,
    originYardId,
    destinationDealerId,
    carrierId,
    dateRange,
    page,
    pageSize,
    sortBy,
    sortOrder,
  ]);

  // 过滤条件变化时回到第一页（防止 total=5 但 page=3 尴尬状态）
  useEffect(() => {
    setPage(1);
  }, [
    orgFilter,
    status,
    originYardId,
    destinationDealerId,
    carrierId,
    dateRange,
    waybillCode,
    customerWaybillCode,
    vinKeyword,
  ]);

  const onCancel = async (w: Waybill) => {
    try {
      await waybillsApi.cancel(w.id);
      message.success(t('waybills.cancelSuccess'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('waybills.cancelFailed'));
    }
  };

  // 经销店下拉：从当前视图 waybills 里去重（无需额外接口）
  const dealerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of waybills) {
      if (w.destinationDealer) {
        map.set(w.destinationDealer.id, w.destinationDealer.dealerName);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ value: id, label }));
  }, [waybills]);

  // 汇总导出：走 all=true 拉当前筛选下全量（后端 100 万条硬顶），一单一行
  const [exporting, setExporting] = useState(false);
  const onExportSummary = async () => {
    setExporting(true);
    try {
      const res = await waybillsApi.list({ ...currentFilters(), all: true });
      const fname = `waybills-summary-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`;
      exportRowsToXlsx<Waybill>(
        res.items,
        [
          {
            header: t('waybills.organization'),
            accessor: (r) =>
              orgNameFromRecord(r, r.organizationId, organizations, locale),
          },
          { header: t('waybills.waybillCode'), accessor: 'waybillCode' },
          { header: t('waybills.customerWaybillCode'), accessor: 'customerWaybillCode' },
          {
            header: t('waybills.status'),
            accessor: (r) => t(`waybillStatus.${r.status}`),
          },
          {
            header: t('waybills.detail.originYard'),
            accessor: (r) => r.originYard?.name ?? r.originText ?? '',
          },
          {
            header: t('waybills.detail.destinationDealer'),
            accessor: (r) => r.destinationDealer?.dealerName ?? '',
          },
          {
            header: t('waybills.detail.carrier'),
            accessor: (r) => r.carrier?.name ?? '',
          },
          {
            header: t('waybills.detail.driver'),
            accessor: (r) => r.driver?.name ?? '',
          },
          {
            header: t('waybills.detail.plateNumber'),
            accessor: (r) => r.vehicle?.plateNumber ?? '',
          },
          {
            header: t('waybills.vinCount'),
            accessor: (r) => r.vins?.length ?? 0,
          },
          {
            header: t('waybills.createdAt'),
            accessor: 'createdAt',
            format: formatDateTime,
          },
        ],
        fname,
      );
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg || (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // 明细导出：按 waybill × vin 展开，一台车一行；空 vins 的运单也保留一行
  const onExportDetail = async () => {
    setExporting(true);
    try {
      const res = await waybillsApi.list({ ...currentFilters(), all: true });
      type DetailRow = {
        waybill: Waybill;
        vinCode: string | null;
        vinModel: string | null;
        vinColor: string | null;
        loadedAt: string | null;
        isSigned: boolean;
      };
      const flat: DetailRow[] = [];
      for (const w of res.items) {
        if (!w.vins || w.vins.length === 0) {
          flat.push({
            waybill: w,
            vinCode: null,
            vinModel: null,
            vinColor: null,
            loadedAt: null,
            isSigned: false,
          });
        } else {
          for (const v of w.vins) {
            flat.push({
              waybill: w,
              vinCode: v.vin,
              vinModel: v.model,
              vinColor: v.color,
              loadedAt: v.loadedAt,
              isSigned: v.isSigned,
            });
          }
        }
      }
      const fname = `waybills-detail-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`;
      exportRowsToXlsx<DetailRow>(
        flat,
        [
          {
            header: t('waybills.organization'),
            accessor: (r) =>
              orgNameFromRecord(r.waybill, r.waybill.organizationId, organizations, locale),
          },
          { header: t('waybills.waybillCode'), accessor: (r) => r.waybill.waybillCode },
          { header: t('waybills.customerWaybillCode'), accessor: (r) => r.waybill.customerWaybillCode ?? '' },
          {
            header: t('waybills.status'),
            accessor: (r) => t(`waybillStatus.${r.waybill.status}`),
          },
          { header: 'VIN', accessor: (r) => r.vinCode ?? '' },
          { header: t('vinInventory.model'), accessor: (r) => r.vinModel ?? '' },
          { header: t('vinInventory.color'), accessor: (r) => r.vinColor ?? '' },
          {
            header: t('waybills.exportLoadedAt'),
            accessor: (r) => r.loadedAt,
            format: formatDateTime,
          },
          {
            header: t('waybills.exportSignStatus'),
            accessor: (r) => (r.isSigned ? t('waybills.exportSigned') : ''),
          },
          {
            header: t('waybills.detail.originYard'),
            accessor: (r) => r.waybill.originYard?.name ?? r.waybill.originText ?? '',
          },
          {
            header: t('waybills.detail.destinationDealer'),
            accessor: (r) => r.waybill.destinationDealer?.dealerName ?? '',
          },
          {
            header: t('waybills.detail.carrier'),
            accessor: (r) => r.waybill.carrier?.name ?? '',
          },
          {
            header: t('waybills.detail.driver'),
            accessor: (r) => r.waybill.driver?.name ?? '',
          },
          {
            header: t('waybills.detail.plateNumber'),
            accessor: (r) => r.waybill.vehicle?.plateNumber ?? '',
          },
          {
            header: t('waybills.createdAt'),
            accessor: (r) => r.waybill.createdAt,
            format: formatDateTime,
          },
        ],
        fname,
      );
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg || (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <h2 style={{ margin: 0 }}>{t('waybills.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={onExportSummary}
            loading={exporting}
            disabled={total === 0 || exporting}
          >
            {t('waybills.exportExcel', { n: total })}
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={onExportDetail}
            loading={exporting}
            disabled={total === 0 || exporting}
          >
            {t('waybills.exportDetailAll')}
          </Button>
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder={t('waybills.searchWaybillCode')}
          value={waybillCode}
          onChange={(e) => setWaybillCode(e.target.value)}
          onSearch={load}
        />
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder={t('waybills.searchCustomerWaybillCode')}
          value={customerWaybillCode}
          onChange={(e) => setCustomerWaybillCode(e.target.value)}
          onSearch={load}
        />
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder={t('waybills.searchVin')}
          value={vinKeyword}
          onChange={(e) => setVinKeyword(e.target.value)}
          onSearch={load}
        />
        <Select
          allowClear
          placeholder={t('waybills.filterStatus')}
          style={{ width: 140 }}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'NOT_ARRIVED', label: t('waybillStatus.NOT_ARRIVED') },
            { value: 'IN_TRANSIT', label: t('waybillStatus.IN_TRANSIT') },
            { value: 'ARRIVED', label: t('waybillStatus.ARRIVED') },
          ]}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('waybills.filterYard')}
          style={{ width: 200 }}
          value={originYardId}
          onChange={setOriginYardId}
          options={yards.map((y) => ({ value: y.id, label: `${y.name} (${y.code})` }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('waybills.filterDealer')}
          style={{ width: 200 }}
          value={destinationDealerId}
          onChange={setDestinationDealerId}
          options={dealerOptions}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('waybills.filterCarrier')}
          style={{ width: 200 }}
          value={carrierId}
          onChange={setCarrierId}
          options={carriers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
          allowClear
          showTime={false}
        />
      </Space>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={waybills}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (n) => t('common.paginationTotal', { n }),
        }}
        onChange={(pag, _filters, sorter) => {
          if (pag.current && pag.current !== page) setPage(pag.current);
          if (pag.pageSize && pag.pageSize !== pageSize) {
            setPageSize(pag.pageSize);
            setPage(1);
          }
          // 单列排序（AntD 未启用 multi-sort）
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          const nextSortBy =
            s && s.order ? (s.columnKey as string | undefined) : undefined;
          const nextSortOrder: 'asc' | 'desc' | undefined =
            s?.order === 'ascend'
              ? 'asc'
              : s?.order === 'descend'
                ? 'desc'
                : undefined;
          if (nextSortBy !== sortBy) setSortBy(nextSortBy);
          if (nextSortOrder !== sortOrder) setSortOrder(nextSortOrder);
        }}
        columns={[
          {
            title: t('waybills.organization'),
            width: 100,
            render: (_: unknown, r: Waybill) =>
              orgNameFromRecord(r, r.organizationId, organizations, locale),
          },
          {
            title: t('waybills.waybillCode'),
            dataIndex: 'waybillCode',
            key: 'waybillCode',
            width: 200,
            sorter: true,
          },
          {
            title: t('waybills.customerWaybillCode'),
            dataIndex: 'customerWaybillCode',
            key: 'customerWaybillCode',
            sorter: true,
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('waybills.status'),
            dataIndex: 'status',
            key: 'status',
            sorter: true,
            render: (v: string, r: Waybill) => (
              <Space direction="vertical" size={2}>
                <Tag color={STATUS_COLOR[v]}>{t(`waybillStatus.${v}`)}</Tag>
                {r.isLocked && <Tag color="red">{t('waybills.isLocked')}</Tag>}
              </Space>
            ),
          },
          {
            title: t('waybills.detail.originYard'),
            render: (_: unknown, r: Waybill) =>
              r.originYard?.name ?? r.originText ?? '-',
          },
          {
            title: t('waybills.detail.destinationDealer'),
            render: (_: unknown, r: Waybill) =>
              r.destinationDealer ? (
                <div>
                  <div style={{ fontSize: 13 }}>{r.destinationDealer.dealerName}</div>
                  {r.destinationDealer.region && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {r.destinationDealer.region}
                    </div>
                  )}
                </div>
              ) : (
                '-'
              ),
          },
          {
            title: t('waybills.detail.carrier'),
            render: (_: unknown, r: Waybill) => r.carrier?.name ?? '-',
          },
          {
            title: t('waybills.detail.driver'),
            render: (_: unknown, r: Waybill) =>
              r.driver ? (
                <div>
                  <div style={{ fontSize: 13 }}>{r.driver.name}</div>
                  {r.driver.phone && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      📞 {r.driver.phone}
                    </div>
                  )}
                </div>
              ) : (
                '-'
              ),
          },
          {
            title: t('waybills.detail.plateNumber'),
            render: (_: unknown, r: Waybill) =>
              r.vehicle?.plateNumber ? (
                <Tag color="blue">{r.vehicle.plateNumber}</Tag>
              ) : (
                '-'
              ),
          },
          {
            title: t('waybills.vinCount'),
            width: 80,
            render: (_: unknown, r: Waybill) => r.vins?.length ?? 0,
          },
          {
            title: t('waybills.createdAt'),
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            sorter: true,
            defaultSortOrder: 'descend',
            render: (v: string) => new Date(v).toLocaleString(),
          },
          {
            title: '',
            width: 260,
            render: (_: unknown, r: Waybill) => {
              const canCancel = r.status === 'NOT_ARRIVED' && !r.isLocked;
              const canAssign = canAssignWaybill(r, {
                role: userRole,
                carrierId: userCarrierId ?? null,
              });
              return (
                <Space size={4}>
                  <Button
                    type="link"
                    size="small"
                    icon={<FileSearchOutlined />}
                    onClick={() => setDetailWaybill(r)}
                  >
                    {t('waybills.detail.view')}
                  </Button>
                  {canAssign && (
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => setAssignTarget(r)}
                    >
                      {t('waybills.detail.assign')}
                    </Button>
                  )}
                  {canCancel && (
                    <Popconfirm
                      title={t('waybills.cancelTitle')}
                      description={t('waybills.cancelHint')}
                      okText={t('waybills.cancelOk')}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onCancel(r)}
                    >
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      >
                        {t('waybills.cancel')}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              );
            },
          },
        ]}
      />

      <AssignWaybillModal
        waybill={assignTarget}
        onClose={() => setAssignTarget(null)}
        onSaved={load}
      />

      <WaybillDetailDrawer
        waybill={detailWaybill}
        onClose={() => setDetailWaybill(null)}
        onSaved={() => {
          setDetailWaybill(null);
          load();
        }}
      />
    </div>
  );
}
