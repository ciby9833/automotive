'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Descriptions,
  Drawer,
  Spin,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import {
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { yardsApi, VinLifecycle } from '@/lib/api/yards';
import {
  EvidenceViewer,
  EvidenceSectionData,
} from '@/components/evidence/EvidenceViewer';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  vin: string | null;
  onClose: () => void;
}

// 扫码事件按 backend 的 ScanAction 枚举给出可读标签 + 颜色
const ACTION_META: Record<string, { color: string; labelKey: string }> = {
  INBOUND_ARRIVAL: { color: 'green', labelKey: 'vinLifecycle.action.INBOUND_ARRIVAL' },
  REALLOCATION_DEPARTURE: { color: 'orange', labelKey: 'vinLifecycle.action.REALLOCATION_DEPARTURE' },
  REALLOCATION_ARRIVAL: { color: 'blue', labelKey: 'vinLifecycle.action.REALLOCATION_ARRIVAL' },
  DELIVERY_DEPARTURE: { color: 'purple', labelKey: 'vinLifecycle.action.DELIVERY_DEPARTURE' },
  SIGNED: { color: 'cyan', labelKey: 'vinLifecycle.action.SIGNED' },
};

export function VinLifecycleDrawer({ vin, onClose }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<VinLifecycle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vin) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    yardsApi
      .vinLifecycle(vin)
      .then(setData)
      .catch(() => setError(t('vinLifecycle.loadFailed')))
      .finally(() => setLoading(false));
  }, [vin, t]);

  const orderVin = data?.orderVin;
  const evidenceSections: EvidenceSectionData[] = orderVin
    ? [
        {
          title: t('vinLifecycle.evidencePickup'),
          emptyText: t('vinLifecycle.evidencePickupEmpty'),
          facts: [
            {
              label: t('vinLifecycle.time'),
              value: orderVin.pickedUpAt
                ? new Date(orderVin.pickedUpAt).toLocaleString()
                : null,
            },
            {
              label: t('vinLifecycle.location'),
              value: orderVin.pickupLocation,
            },
            {
              label: t('vinLifecycle.carrier'),
              value: orderVin.pickupCarrier
                ? orderVin.pickupCarrier.shortName ?? orderVin.pickupCarrier.name
                : null,
            },
            {
              label: t('vinLifecycle.driver'),
              value: orderVin.pickupDriverUser?.displayName ?? null,
            },
          ],
          photoKeys: orderVin.pickupPhotoUrls,
          remark: orderVin.pickupRemark,
        },
        {
          title: t('vinLifecycle.evidenceArrival'),
          emptyText: t('vinLifecycle.evidenceArrivalEmpty'),
          facts: [
            {
              label: t('vinLifecycle.time'),
              value: orderVin.arrivedAt
                ? new Date(orderVin.arrivedAt).toLocaleString()
                : null,
            },
            {
              label: t('vinLifecycle.slot'),
              value: orderVin.slot?.code ?? null,
            },
            {
              label: t('vinLifecycle.staff'),
              value: orderVin.arrivedByUser?.displayName ?? null,
            },
            {
              label: t('vinLifecycle.batch'),
              value: orderVin.inboundBatch?.batchCode ?? null,
            },
          ],
          photoKeys: orderVin.arrivalPhotoUrls,
          checkInfo: orderVin.vehicleCheckInfo,
          remark: orderVin.arrivalRemark,
        },
      ]
    : [];

  return (
    <Drawer
      title={vin ? `${t('vinLifecycle.title')} · ${vin}` : t('vinLifecycle.title')}
      open={!!vin}
      onClose={onClose}
      width={780}
      destroyOnClose
    >
      {loading && <Spin />}
      {error && (
        <Alert
          type="error"
          message={error}
          icon={<ExclamationCircleOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 基本信息 */}
          {orderVin && (
            <section
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 16,
                background: '#fff',
              }}
            >
              <Descriptions
                title={t('vinLifecycle.basic')}
                column={2}
                size="small"
              >
                <Descriptions.Item label={t('vinLifecycle.brand')}>
                  {orderVin.brand ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('vinLifecycle.model')}>
                  {orderVin.model ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('vinLifecycle.color')}>
                  {orderVin.color ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('vinLifecycle.motorNo')}>
                  {orderVin.motorNo ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('vinLifecycle.inboundOrder')}>
                  {orderVin.order?.orderCode ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('vinLifecycle.currentSlot')}>
                  {orderVin.slot ? (
                    <Tag color="green">
                      {orderVin.slot.yard?.code}·{orderVin.slot.code}
                    </Tag>
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('vinLifecycle.status')} span={2}>
                  <Tag color={
                    orderVin.arrivalStatus === 'ARRIVED' ? 'green' :
                    orderVin.arrivalStatus === 'CANCELLED' ? 'red' :
                    'default'
                  }>
                    {t(`vinLifecycle.arrivalStatus.${orderVin.arrivalStatus}`)}
                  </Tag>
                  {orderVin.isAllocated && (
                    <Tag color="blue">{t('vinLifecycle.allocated')}</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </section>
          )}

          {/* 出库运单 */}
          {data.waybills.length > 0 && (
            <section
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 16,
                background: '#fff',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12 }}>
                {t('vinLifecycle.waybills')} ({data.waybills.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.waybills.map((wb) => (
                  <div
                    key={wb.id}
                    style={{
                      padding: 10,
                      borderRadius: 4,
                      background: '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {wb.waybillCode}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {wb.destinationDealer?.dealerName ?? '-'} ·{' '}
                        {wb.carrier?.name ?? '-'}
                      </div>
                    </div>
                    <Tag color={
                      wb.status === 'ARRIVED' ? 'green' :
                      wb.status === 'IN_TRANSIT' ? 'blue' :
                      'default'
                    }>
                      {t(`vinLifecycle.waybillStatus.${wb.status}`)}
                    </Tag>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 时间线：扫码事件 */}
          {data.events.length > 0 && (
            <section
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 16,
                background: '#fff',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12 }}>
                {t('vinLifecycle.timeline')}
              </div>
              <Timeline
                items={data.events.map((e) => {
                  const meta = ACTION_META[e.action] ?? { color: 'gray', labelKey: e.action };
                  return {
                    dot: <ClockCircleOutlined style={{ fontSize: 14 }} />,
                    color: meta.color,
                    children: (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color={meta.color}>
                            {t(meta.labelKey)}
                          </Tag>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            {new Date(e.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                          {e.operator && (
                            <Tooltip title={t('vinLifecycle.operator')}>
                              <span><UserOutlined /> {e.operator.displayName}</span>
                            </Tooltip>
                          )}
                          {e.yard && <span style={{ marginLeft: 8 }}>@ {e.yard.name}</span>}
                          {e.waybill && <span style={{ marginLeft: 8 }}>· {e.waybill.waybillCode}</span>}
                        </div>
                        {e.remark && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
                            {e.remark}
                          </div>
                        )}
                      </div>
                    ),
                  };
                })}
              />
            </section>
          )}

          {/* 提货 + 到达凭证 */}
          {orderVin && <EvidenceViewer sections={evidenceSections} />}
        </div>
      )}
    </Drawer>
  );
}
