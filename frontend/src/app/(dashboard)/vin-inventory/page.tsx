'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { useRouter } from 'next/navigation';
import { DownloadOutlined, EnvironmentOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { yardsApi, VinInventoryRow, Yard } from '@/lib/api/yards';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { exportRowsToXlsx, formatDateTime } from '@/lib/export/xlsx';

const { RangePicker } = DatePicker;

// 库存视图默认不按时间过滤：库存的语义是"现在还在库的车"，用时间过滤会漏掉
// 上月/上季度入位、至今没动的车。用户想按"入位时间"分段查阅时手动选。
// （与运单管理不同：运单是事件流，默认当月合理）

export default function VinInventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VinInventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [exporting, setExporting] = useState(false);
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(false);
  const [vinFilter, setVinFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [yardId, setYardId] = useState<string | undefined>();
  const [slotCode, setSlotCode] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [minStayDays, setMinStayDays] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { t } = useTranslation();

  useEffect(() => {
    yardsApi.list().then(setYards).catch(() => undefined);
  }, []);

  const currentFilters = () => ({
    vin: vinFilter.trim() || undefined,
    organizationId: orgFilter,
    yardId,
    slotCode: slotCode.trim() || undefined,
    orderCode: orderCode.trim() || undefined,
    minStayDays: minStayDays ?? undefined,
    dateFrom: dateRange?.[0]?.toISOString(),
    dateTo: dateRange?.[1]?.toISOString(),
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await yardsApi.vinInventory({
        ...currentFilters(),
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      setRows(res.items);
      setTotal(res.total);
    } catch {
      message.error(t('vinInventory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeOrgId,
    orgFilter,
    yardId,
    minStayDays,
    dateRange,
    page,
    pageSize,
    sortBy,
    sortOrder,
  ]);
  useEffect(() => setPage(1), [orgFilter, yardId, minStayDays, dateRange, vinFilter, slotCode, orderCode]);

  const locateOnBoard = (row: VinInventoryRow) => {
    router.push(
      `/yards?yardId=${row.yardId}&highlightVin=${encodeURIComponent(row.vin)}`,
    );
  };

  const yardOptions = useMemo(
    () => yards.map((y) => ({ value: y.id, label: `${y.name} (${y.code})` })),
    [yards],
  );

  const onExport = async () => {
    setExporting(true);
    try {
      const res = await yardsApi.vinInventory({ ...currentFilters(), all: true });
      const fname = `vin-inventory-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`;
      exportRowsToXlsx<VinInventoryRow>(
        res.items,
        [
          { header: 'VIN', accessor: 'vin' },
          { header: t('vinInventory.model'), accessor: 'model' },
          { header: t('vinInventory.color'), accessor: 'color' },
          { header: t('vinInventory.vehicleType'), accessor: 'vehicleType' },
          { header: t('vinInventory.yard'), accessor: (r) => `${r.yardName} (${r.yardCode})` },
          { header: t('vinInventory.slot'), accessor: 'slotCode' },
          { header: t('vinInventory.stayDays'), accessor: 'stayDays' },
          { header: t('vinInventory.orderCode'), accessor: 'orderCode' },
          {
            header: t('vinInventory.assignedAt'),
            accessor: 'assignedAt',
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
          <h2 style={{ margin: 0 }}>{t('vinInventory.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={onExport}
          loading={exporting}
          disabled={total === 0 || exporting}
        >
          {t('vinInventory.exportExcel', { n: total })}
        </Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          style={{ width: 220 }}
          placeholder={t('vinInventory.vinPlaceholder')}
          value={vinFilter}
          onChange={(e) => setVinFilter(e.target.value)}
          onSearch={load}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('vinInventory.yardPlaceholder')}
          style={{ width: 200 }}
          value={yardId}
          onChange={setYardId}
          options={yardOptions}
        />
        <Input.Search
          allowClear
          style={{ width: 160 }}
          placeholder={t('vinInventory.slotPlaceholder')}
          value={slotCode}
          onChange={(e) => setSlotCode(e.target.value)}
          onSearch={load}
        />
        <Input.Search
          allowClear
          style={{ width: 200 }}
          placeholder={t('vinInventory.orderPlaceholder')}
          value={orderCode}
          onChange={(e) => setOrderCode(e.target.value)}
          onSearch={load}
        />
        <span style={{ color: '#64748b' }}>{t('vinInventory.minStayDays')}</span>
        <InputNumber
          min={0}
          max={365}
          style={{ width: 80 }}
          value={minStayDays}
          onChange={(v) => setMinStayDays(v)}
          placeholder="0"
        />
        <span style={{ color: '#64748b' }}>{t('vinInventory.dateRange')}</span>
        <RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
          allowClear
          showTime={false}
        />
      </Space>

      <Table
        rowKey="slotId"
        loading={loading}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (n) => t('common.paginationTotal', { n }),
        }}
        onChange={(pag, _f, sorter) => {
          if (pag.current && pag.current !== page) setPage(pag.current);
          if (pag.pageSize && pag.pageSize !== pageSize) {
            setPageSize(pag.pageSize);
            setPage(1);
          }
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          setSortBy(s && s.order ? (s.columnKey as string) : undefined);
          setSortOrder(
            s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined,
          );
        }}
        columns={[
          { title: 'VIN', dataIndex: 'vin', width: 200 },
          { title: t('vinInventory.model'), dataIndex: 'model', render: (v) => v ?? '-' },
          { title: t('vinInventory.color'), dataIndex: 'color', render: (v) => v ?? '-' },
          { title: t('vinInventory.vehicleType'), dataIndex: 'vehicleType', render: (v) => v ?? '-' },
          {
            title: t('vinInventory.yard'),
            dataIndex: 'yardName',
            key: 'yardName',
            sorter: true,
            render: (_: unknown, r: VinInventoryRow) => `${r.yardName} (${r.yardCode})`,
          },
          {
            title: t('vinInventory.slot'),
            dataIndex: 'slotCode',
            key: 'slotCode',
            sorter: true,
            render: (v: string) => <Tag color="green">{v}</Tag>,
          },
          {
            title: t('vinInventory.stayDays'),
            dataIndex: 'stayDays',
            key: 'stayDays',
            width: 120,
            sorter: true,
            defaultSortOrder: 'descend' as const,
            render: (n: number) => (
              <Tag color={n >= 30 ? 'red' : n >= 14 ? 'orange' : 'default'}>
                {t('vinInventory.days', { n })}
              </Tag>
            ),
          },
          {
            title: t('vinInventory.orderCode'),
            dataIndex: 'orderCode',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('vinInventory.action'),
            width: 140,
            render: (_, r) => (
              <Button
                size="small"
                icon={<EnvironmentOutlined />}
                onClick={() => locateOnBoard(r)}
              >
                {t('vinInventory.locate')}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
