'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Input,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { inboundApi, InboundOrderListRow } from '@/lib/api/inbound';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { Permission, usePermission } from '@/lib/auth/permissions';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { localizedOrganizationName } from '@/i18n/organizationNames';

export default function InboundOrdersPage() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { t, locale } = useTranslation();
  const canImport = usePermission(Permission.INBOUND_IMPORT);
  const organizations = useOrganizations();

  const [rows, setRows] = useState<InboundOrderListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED'
  >('ALL');
  const [orderSearch, setOrderSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();

  const load = () => {
    setLoading(true);
    inboundApi
      .listOrders({
        status,
        customerOrderNo: orderSearch.trim() || undefined,
        organizationId: orgFilter,
      })
      .then(setRows)
      .catch(() => message.error(t('inbound.orders.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [activeOrgId, status, orgFilter]);

  const orgLabel = (id: string, fallbackName: string) => {
    const o = organizations.find((x) => x.id === id);
    if (o) return localizedOrganizationName(o.code, o.name, locale);
    return fallbackName || '-';
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap>
          <h2 style={{ margin: 0 }}>{t('inbound.orders.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
          <Segmented
            value={status}
            onChange={(v) =>
              setStatus(v as 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED')
            }
            options={[
              { label: t('inbound.orders.filterAll'), value: 'ALL' },
              { label: t('inbound.orders.filterPending'), value: 'PENDING' },
              { label: t('inbound.orders.filterCompleted'), value: 'COMPLETED' },
              { label: t('inbound.orders.filterCancelled'), value: 'CANCELLED' },
            ]}
          />
          <Input.Search
            style={{ width: 260 }}
            allowClear
            placeholder={t('inbound.orders.searchOrder')}
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            onSearch={load}
          />
        </Space>
        {canImport && (
          <Link href="/inbound/import">
            <Button type="primary" icon={<PlusOutlined />}>
              {t('inbound.orders.importBtn')}
            </Button>
          </Link>
        )}
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: t('inbound.orders.organization'),
            render: (_: unknown, r: InboundOrderListRow) =>
              orgLabel(r.organizationId, r.organizationName),
          },
          {
            title: t('inbound.orders.orderCode'),
            dataIndex: 'orderCode',
            render: (v: string, r: InboundOrderListRow) => (
              <Link href={`/inbound/orders/${r.id}`}>{v}</Link>
            ),
          },
          {
            title: t('inbound.orders.customerOrderNo'),
            dataIndex: 'customerOrderNo',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('inbound.orders.customer'),
            dataIndex: 'customerName',
          },
          {
            title: t('inbound.orders.destinationYard'),
            dataIndex: 'destinationYardName',
          },
          {
            title: t('inbound.orders.expectedArrival'),
            dataIndex: 'expectedArrivalDate',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('inbound.orders.importedAt'),
            dataIndex: 'createdAt',
            width: 170,
            defaultSortOrder: 'descend' as const,
            sorter: (a: InboundOrderListRow, b: InboundOrderListRow) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
          },
          {
            title: t('inbound.orders.progress'),
            render: (_: unknown, r: InboundOrderListRow) => (
              <div style={{ minWidth: 200 }}>
                <Progress
                  percent={r.total > 0 ? Math.round((r.arrived / r.total) * 100) : 0}
                  size="small"
                  format={() => `${r.arrived}/${r.total}`}
                />
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {t('inbound.orders.pickedUp', { n: r.pickedUp })}
                </div>
              </div>
            ),
          },
          {
            title: t('inbound.orders.status'),
            render: (_: unknown, r: InboundOrderListRow) => {
              if (r.status === 'CANCELLED') {
                return (
                  <div>
                    <Tag color="red">{t('inbound.orders.cancelled')}</Tag>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {r.cancelledByUserName ?? '-'}
                      {r.cancelledAt
                        ? ` · ${new Date(r.cancelledAt).toLocaleString()}`
                        : ''}
                    </div>
                  </div>
                );
              }
              if (r.total === 0) return <Tag>{t('inbound.orders.empty')}</Tag>;
              if (r.arrived === r.total)
                return <Tag color="green">{t('inbound.orders.completed')}</Tag>;
              if (r.arrived > 0)
                return <Tag color="processing">{t('inbound.orders.partial')}</Tag>;
              return <Tag>{t('inbound.orders.pending')}</Tag>;
            },
          },
          {
            title: t('inbound.orders.pickupAssignment'),
            width: 220,
            render: (_: unknown, r: InboundOrderListRow) => {
              if (r.status === 'CANCELLED') return '-';
              if (!r.pickupCarrierId) {
                return <Tag>{t('inbound.orders.pickupNotAssigned')}</Tag>;
              }
              const color =
                r.pickupStatus === 'COMPLETED'
                  ? 'green'
                  : r.pickupStatus === 'IN_PROGRESS'
                    ? 'processing'
                    : 'blue';
              return (
                <div>
                  <Tag color={color}>
                    {t(`inbound.orders.pickupStatus.${r.pickupStatus}`)}
                  </Tag>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    {r.pickupCarrierName ?? '-'}
                  </div>
                  {r.plannedPickupDate && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {t('inbound.orders.plannedShort')}: {r.plannedPickupDate}
                    </div>
                  )}
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
