'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Space, Table, message } from 'antd';
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
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();

  useEffect(() => {
    setLoading(true);
    outboundApi
      .listOrders({
        customerOrderNo: q || undefined,
        organizationId: orgFilter || undefined,
      })
      .then(setRows)
      .catch(() => message.error(t('outbound.orders.loadFailed')))
      .finally(() => setLoading(false));
  }, [activeOrgId, orgFilter, q, t]);

  return (
    <div>
      <PageHeader
        title={t('outbound.orders.title')}
        toolbar={
          <Space wrap>
            <OrgFilter value={orgFilter} onChange={setOrgFilter} />
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
            render: (v, r) => (
              <Link href={`/outbound/orders/${r.id}`}>{v}</Link>
            ),
          },
          {
            title: t('outbound.orders.customerOrderNo'),
            dataIndex: 'customerOrderNo',
            render: (v) => v ?? '-',
          },
          { title: t('outbound.orders.customer'), dataIndex: 'customerName' },
          {
            title: t('outbound.orders.originYard'),
            dataIndex: 'originYardName',
          },
          {
            title: t('outbound.orders.createdAt'),
            dataIndex: 'createdAt',
            render: (v: string) => new Date(v).toLocaleString(),
          },
        ]}
      />
    </div>
  );
}
