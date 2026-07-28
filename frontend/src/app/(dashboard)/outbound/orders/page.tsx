'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Segmented, Space, Table, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { outboundApi, OutboundOrderListRow } from '@/lib/api/outbound';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { Permission, usePermission } from '@/lib/auth/permissions';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { localizedOrganizationName } from '@/i18n/organizationNames';

export default function OutboundOrdersPage() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { t, locale } = useTranslation();
  const canImport = usePermission(Permission.OUTBOUND_IMPORT);
  const organizations = useOrganizations();

  const [rows, setRows] = useState<OutboundOrderListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<
    'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED'
  >('ALL');

  useEffect(() => {
    setLoading(true);
    outboundApi
      .listOrders({
        customerOrderNo: q || undefined,
        organizationId: orgFilter || undefined,
        status,
        page,
        pageSize,
        sortBy,
        sortOrder,
      })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
      })
      .catch(() => message.error(t('outbound.orders.loadFailed')))
      .finally(() => setLoading(false));
  }, [activeOrgId, orgFilter, q, status, page, pageSize, sortBy, sortOrder, t]);
  useEffect(() => setPage(1), [orgFilter, q, status]);

  return (
    <div>
      <PageHeader
        title={t('outbound.orders.title')}
        toolbar={
          <Space wrap>
            <OrgFilter value={orgFilter} onChange={setOrgFilter} />
            <Segmented
              value={status}
              onChange={(v) =>
                setStatus(v as 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED')
              }
              options={[
                { label: t('outbound.orders.filterAll'), value: 'ALL' },
                { label: t('outbound.orders.filterCancelled'), value: 'CANCELLED' },
              ]}
            />
            <Input.Search
              placeholder={t('outbound.orders.searchCustomerOrderNo')}
              allowClear
              onSearch={setQ}
              style={{ width: 260 }}
            />
          </Space>
        }
        actions={
          canImport && (
            <Link href="/outbound/import">
              <Button type="primary" icon={<PlusOutlined />}>
                {t('outbound.orders.importExcel')}
              </Button>
            </Link>
          )
        }
      />
      <Table
        rowKey="id"
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
          {
            title: t('outbound.orders.organization'),
            render: (_, r) => {
              const o = organizations.find((x) => x.id === r.organizationId);
              return o
                ? localizedOrganizationName(o.code, o.name, locale)
                : r.organizationName || '-';
            },
          },
          {
            title: t('outbound.orders.orderCode'),
            dataIndex: 'orderCode',
            key: 'orderCode',
            sorter: true,
            render: (v, r) => (
              <Link href={`/outbound/orders/${r.id}`}>{v}</Link>
            ),
          },
          {
            title: t('outbound.orders.customerOrderNo'),
            dataIndex: 'customerOrderNo',
            key: 'customerOrderNo',
            sorter: true,
            render: (v) => v ?? '-',
          },
          { title: t('outbound.orders.customer'), dataIndex: 'customerName' },
          {
            title: t('outbound.orders.originYard'),
            render: (_, r) => {
              if (!r.originYards || r.originYards.length === 0) {
                return r.originYardName ?? '-';
              }
              if (r.originYards.length === 1) {
                return r.originYards[0].yardName;
              }
              return (
                <Space size={4} wrap>
                  <Tag color="cyan">
                    {t('outbound.orders.originYardMulti', {
                      n: r.originYards.length,
                    })}
                  </Tag>
                  {r.originYards.map((y) => (
                    <Tag key={y.yardId ?? '__unarrived__'}>
                      {y.yardName} · {y.vinCount}
                    </Tag>
                  ))}
                </Space>
              );
            },
          },
          {
            title: t('outbound.orders.createdAt'),
            dataIndex: 'createdAt',
            key: 'createdAt',
            defaultSortOrder: 'descend',
            sorter: true,
            render: (v: string) => new Date(v).toLocaleString(),
          },
          {
            title: t('outbound.orders.status'),
            width: 200,
            render: (_, r) => {
              if (r.status !== 'CANCELLED') {
                return <Tag color="blue">{t('outbound.orders.statusActive')}</Tag>;
              }
              return (
                <div>
                  <Tag color="red">{t('outbound.orders.statusCancelled')}</Tag>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {r.cancelledByUserName ?? '-'}
                    {r.cancelledAt
                      ? ` · ${new Date(r.cancelledAt).toLocaleString()}`
                      : ''}
                  </div>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
