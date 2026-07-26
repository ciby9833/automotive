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

// 默认时间范围：当月（业务约定）
function currentMonthRange(): [Dayjs, Dayjs] {
  return [dayjs().startOf('month'), dayjs().endOf('month')];
}

export default function VinInventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VinInventoryRow[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(false);
  const [vinFilter, setVinFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [yardId, setYardId] = useState<string | undefined>();
  const [slotCode, setSlotCode] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [minStayDays, setMinStayDays] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(
    currentMonthRange(),
  );
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { t } = useTranslation();

  useEffect(() => {
    yardsApi.list().then(setYards).catch(() => undefined);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const list = await yardsApi.vinInventory({
        vin: vinFilter.trim() || undefined,
        organizationId: orgFilter,
        yardId,
        slotCode: slotCode.trim() || undefined,
        orderCode: orderCode.trim() || undefined,
        minStayDays: minStayDays ?? undefined,
        dateFrom: dateRange?.[0]?.toISOString(),
        dateTo: dateRange?.[1]?.toISOString(),
      });
      setRows(list);
    } catch {
      message.error(t('vinInventory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter, yardId, minStayDays, dateRange]);

  const locateOnBoard = (row: VinInventoryRow) => {
    router.push(
      `/yards?yardId=${row.yardId}&highlightVin=${encodeURIComponent(row.vin)}`,
    );
  };

  const yardOptions = useMemo(
    () => yards.map((y) => ({ value: y.id, label: `${y.name} (${y.code})` })),
    [yards],
  );

  const onExport = () => {
    try {
      const fname = `vin-inventory-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`;
      exportRowsToXlsx<VinInventoryRow>(
        rows,
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
      message.error((e as Error).message);
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
          disabled={rows.length === 0}
        >
          {t('vinInventory.exportExcel', { n: rows.length })}
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
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'VIN', dataIndex: 'vin', width: 200 },
          { title: t('vinInventory.model'), dataIndex: 'model', render: (v) => v ?? '-' },
          { title: t('vinInventory.color'), dataIndex: 'color', render: (v) => v ?? '-' },
          { title: t('vinInventory.vehicleType'), dataIndex: 'vehicleType', render: (v) => v ?? '-' },
          { title: t('vinInventory.yard'), render: (_, r) => `${r.yardName} (${r.yardCode})` },
          {
            title: t('vinInventory.slot'),
            dataIndex: 'slotCode',
            render: (v: string) => <Tag color="green">{v}</Tag>,
          },
          {
            title: t('vinInventory.stayDays'),
            dataIndex: 'stayDays',
            width: 120,
            render: (n: number) => (
              <Tag color={n >= 30 ? 'red' : n >= 14 ? 'orange' : 'default'}>
                {t('vinInventory.days', { n })}
              </Tag>
            ),
            sorter: (a, b) => a.stayDays - b.stayDays,
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
