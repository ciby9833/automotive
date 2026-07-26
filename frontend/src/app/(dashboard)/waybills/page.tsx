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
  const [yards, setYards] = useState<Yard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [waybillCode, setWaybillCode] = useState('');
  const [customerWaybillCode, setCustomerWaybillCode] = useState('');
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

  const load = () => {
    setLoading(true);
    waybillsApi
      .list({
        organizationId: orgFilter,
        waybillCode: waybillCode.trim() || undefined,
        customerWaybillCode: customerWaybillCode.trim() || undefined,
        status,
        originYardId,
        destinationDealerId,
        carrierId,
        dateFrom: dateRange?.[0]?.toISOString(),
        dateTo: dateRange?.[1]?.toISOString(),
      })
      .then(setWaybills)
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

  const onExport = () => {
    try {
      const fname = `waybills-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`;
      exportRowsToXlsx<Waybill>(
        waybills,
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
      message.error((e as Error).message);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <h2 style={{ margin: 0 }}>{t('waybills.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={onExport}
          disabled={waybills.length === 0}
        >
          {t('waybills.exportExcel', { n: waybills.length })}
        </Button>
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
        columns={[
          {
            title: t('waybills.organization'),
            width: 100,
            render: (_: unknown, r: Waybill) =>
              orgNameFromRecord(r, r.organizationId, organizations, locale),
          },
          { title: t('waybills.waybillCode'), dataIndex: 'waybillCode', width: 200 },
          {
            title: t('waybills.customerWaybillCode'),
            dataIndex: 'customerWaybillCode',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('waybills.status'),
            dataIndex: 'status',
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
