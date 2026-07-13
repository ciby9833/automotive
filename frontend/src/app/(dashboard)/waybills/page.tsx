'use client';

import { useEffect, useState } from 'react';
import { Space, Table, Tag, message } from 'antd';
import { waybillsApi, Waybill } from '@/lib/api/waybills';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { OrgFilter } from '@/components/layout/OrgFilter';

const STATUS_COLOR: Record<string, string> = {
  NOT_ARRIVED: 'default',
  IN_TRANSIT: 'processing',
  ARRIVED: 'success',
};

// P0阶段先展示运单列表；移动端扫码/JFS状态更新走 /waybills/scan 接口(阶段2H5扫码页调用)
export default function WaybillsPage() {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  useEffect(() => {
    setLoading(true);
    waybillsApi
      .list({ organizationId: orgFilter })
      .then(setWaybills)
      .catch(() => message.error(t('waybills.loadFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('waybills.title')}</h2>
        <OrgFilter value={orgFilter} onChange={setOrgFilter} />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={waybills}
        columns={[
          {
            title: t('waybills.organization'),
            render: (_: unknown, record: Waybill) =>
              orgNameFromRecord(record, record.organizationId, organizations, locale),
          },
          { title: t('waybills.waybillCode'), dataIndex: 'waybillCode' },
          { title: t('waybills.customerWaybillCode'), dataIndex: 'customerWaybillCode' },
          {
            title: t('waybills.status'),
            dataIndex: 'status',
            render: (v: string) => (
              <Tag color={STATUS_COLOR[v]}>{t(`waybillStatus.${v}`)}</Tag>
            ),
          },
          {
            title: t('waybills.locked'),
            dataIndex: 'isLocked',
            render: (v: boolean) => (v ? <Tag color="red">{t('waybills.isLocked')}</Tag> : '-'),
          },
          {
            title: t('waybills.vinCount'),
            dataIndex: 'vins',
            render: (vins: Waybill['vins']) => vins?.length ?? 0,
          },
        ]}
      />
    </div>
  );
}
