'use client';

import { useEffect, useState } from 'react';
import { Button, Popconfirm, Space, Table, Tag, message } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { waybillsApi, Waybill } from '@/lib/api/waybills';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { WaybillDetailDrawer } from '@/components/waybills/WaybillDetailDrawer';
import { AssignWaybillModal } from '@/components/waybills/AssignWaybillModal';
import { canAssignWaybill } from '@/components/waybills/canAssignWaybill';

const STATUS_COLOR: Record<string, string> = {
  NOT_ARRIVED: 'default',
  IN_TRANSIT: 'processing',
  ARRIVED: 'success',
};

export default function WaybillsPage() {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [detailWaybill, setDetailWaybill] = useState<Waybill | null>(null);
  const [assignTarget, setAssignTarget] = useState<Waybill | null>(null);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const userRole = useAuthStore((s) => s.user?.role);
  const userCarrierId = useAuthStore((s) => s.externalContext?.carrierId);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  const load = () => {
    setLoading(true);
    waybillsApi
      .list({ organizationId: orgFilter })
      .then(setWaybills)
      .catch(() => message.error(t('waybills.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter]);

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

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('waybills.title')}</h2>
        <OrgFilter value={orgFilter} onChange={setOrgFilter} />
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
                {r.isLocked && (
                  <Tag color="red">{t('waybills.isLocked')}</Tag>
                )}
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
                  <div style={{ fontSize: 13 }}>
                    {r.destinationDealer.dealerName}
                  </div>
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
