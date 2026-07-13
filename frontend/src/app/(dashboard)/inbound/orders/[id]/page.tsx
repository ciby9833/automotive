'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'antd';
import { FileImageOutlined } from '@ant-design/icons';
import {
  inboundApi,
  InboundOrderVinDetail,
  OrderVinArrivalStatus,
} from '@/lib/api/inbound';
import { useTranslation } from '@/i18n/useTranslation';
import {
  EvidenceViewer,
  EvidenceSectionData,
} from '@/components/evidence/EvidenceViewer';

interface OrderHead {
  id: string;
  orderCode: string;
  customerOrderNo: string | null;
  originText: string | null;
  expectedArrivalDate: string | null;
  remark: string | null;
  createdAt: string;
  customer?: { id: string; name: string };
  destinationYard?: { id: string; name: string; code: string };
  organization?: { id: string; name: string; code: string };
}

const STATUS_COLORS: Record<OrderVinArrivalStatus, string> = {
  EXPECTED: 'default',
  ARRIVED: 'green',
  CANCELLED: 'red',
};

// 单条 VIN 的凭证 (提货 + 入库) 结构化成 EvidenceViewer 的 sections
// 独立成函数避免污染主组件；detail 页可能扩展到出库时可直接复用同一转换器
function buildEvidenceSections(
  vin: InboundOrderVinDetail,
  t: (key: string) => string,
): EvidenceSectionData[] {
  return [
    {
      title: t('inbound.detail.evidence.pickup'),
      emptyText: t('inbound.detail.evidence.pickupEmpty'),
      facts: [
        {
          label: t('inbound.detail.evidence.time'),
          value: vin.pickedUpAt ? new Date(vin.pickedUpAt).toLocaleString() : null,
        },
        {
          label: t('inbound.detail.evidence.location'),
          value: vin.pickupLocation,
        },
        {
          label: t('inbound.detail.evidence.carrier'),
          value: vin.pickupCarrier
            ? vin.pickupCarrier.shortName ?? vin.pickupCarrier.name
            : null,
        },
        {
          label: t('inbound.detail.evidence.driver'),
          value: vin.pickupDriverUser?.displayName ?? null,
        },
      ],
      photoKeys: vin.pickupPhotoUrls,
      remark: vin.pickupRemark,
    },
    {
      title: t('inbound.detail.evidence.arrival'),
      emptyText: t('inbound.detail.evidence.arrivalEmpty'),
      facts: [
        {
          label: t('inbound.detail.evidence.time'),
          value: vin.arrivedAt ? new Date(vin.arrivedAt).toLocaleString() : null,
        },
        {
          label: t('inbound.detail.evidence.slot'),
          value: vin.slot?.code ?? null,
        },
        {
          label: t('inbound.detail.evidence.staff'),
          value: vin.arrivedByUser?.displayName ?? null,
        },
        {
          label: t('inbound.detail.evidence.batch'),
          value: vin.inboundBatch?.batchCode ?? null,
        },
      ],
      photoKeys: vin.arrivalPhotoUrls,
      checkInfo: vin.vehicleCheckInfo,
      remark: vin.arrivalRemark,
    },
  ];
}

export function InboundOrderDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderHead | null>(null);
  const [vins, setVins] = useState<InboundOrderVinDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [evidenceVin, setEvidenceVin] = useState<InboundOrderVinDetail | null>(null);
  const evidenceSections = useMemo(
    () => (evidenceVin ? buildEvidenceSections(evidenceVin, t) : []),
    [evidenceVin, t],
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    inboundApi
      .orderDetail(id)
      .then((data) => {
        setOrder(data.order as OrderHead);
        setVins(data.vins);
      })
      .catch(() => message.error(t('inbound.detail.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const total = vins.length;
  const arrived = vins.filter((v) => v.arrivalStatus === 'ARRIVED').length;
  const pickedUp = vins.filter((v) => !!v.pickedUpAt).length;
  const cancelled = vins.filter((v) => v.arrivalStatus === 'CANCELLED').length;

  if (!order && !loading) return null;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>
        {t('inbound.detail.title')}: {order?.orderCode}
      </h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('inbound.detail.totalVins')}
              value={total}
              suffix={t('inbound.detail.vehicles')}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('inbound.detail.pickedUp')}
              value={pickedUp}
              suffix={`/ ${total}`}
              valueStyle={{ color: '#f59e0b' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('inbound.detail.arrived')}
              value={arrived}
              suffix={`/ ${total}`}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('inbound.detail.pending')}
              value={total - arrived - cancelled}
              valueStyle={{ color: '#64748b' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t('inbound.detail.orderHead')} style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={t('inbound.detail.customer')}>
            {order?.customer?.name ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.customerOrderNo')}>
            {order?.customerOrderNo ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.destinationYard')}>
            {order?.destinationYard
              ? `${order.destinationYard.name} (${order.destinationYard.code})`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.origin')}>
            {order?.originText ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.organization')}>
            {order?.organization?.name ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.expectedArrival')}>
            {order?.expectedArrivalDate ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.remark')} span={2}>
            {order?.remark ?? '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={t('inbound.detail.vinList')}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={vins}
          pagination={{ pageSize: 100 }}
          columns={[
            { title: 'VIN', dataIndex: 'vin', width: 190 },
            {
              title: 'Model',
              render: (_: unknown, r: InboundOrderVinDetail) =>
                [r.brand, r.model].filter(Boolean).join(' / ') || '-',
            },
            { title: 'Color', dataIndex: 'color', render: (v) => v ?? '-' },
            {
              title: t('inbound.detail.vinStatus'),
              dataIndex: 'arrivalStatus',
              render: (v: OrderVinArrivalStatus) => (
                <Tag color={STATUS_COLORS[v]}>{t(`inbound.detail.status.${v}`)}</Tag>
              ),
            },
            {
              title: t('inbound.detail.pickup'),
              render: (_: unknown, r: InboundOrderVinDetail) => {
                // 有 pickup 流水 = 极兔承运商提的
                if (r.pickedUpAt) {
                  return (
                    <Space direction="vertical" size={2}>
                      <span style={{ fontSize: 12 }}>
                        {new Date(r.pickedUpAt).toLocaleString()}
                      </span>
                      {r.pickupCarrier && (
                        <Tag color="orange">
                          {r.pickupCarrier.shortName ?? r.pickupCarrier.name}
                        </Tag>
                      )}
                    </Space>
                  );
                }
                // 无 pickup 流水 + 已到仓 = 三方直送（别家送来的，我们没提货记录）
                if (r.arrivalStatus === 'ARRIVED') {
                  return <Tag color="default">{t('inbound.detail.thirdParty')}</Tag>;
                }
                if (r.arrivalStatus === 'CANCELLED') {
                  return <Tag color="red">{t('inbound.detail.status.CANCELLED')}</Tag>;
                }
                // EXPECTED：还没提也没到
                return <Tag color="default">{t('inbound.detail.awaitingPickup')}</Tag>;
              },
            },
            {
              title: t('inbound.detail.slot'),
              render: (_: unknown, r: InboundOrderVinDetail) =>
                r.slot ? (
                  <Tag color="green">{r.slot.code}</Tag>
                ) : (
                  <span style={{ color: '#94a3b8' }}>-</span>
                ),
            },
            {
              title: t('inbound.detail.arrivedAt'),
              render: (_: unknown, r: InboundOrderVinDetail) =>
                r.arrivedAt ? new Date(r.arrivedAt).toLocaleString() : '-',
            },
            {
              title: t('inbound.detail.evidence.title'),
              width: 90,
              render: (_: unknown, r: InboundOrderVinDetail) => {
                const hasAny =
                  (r.pickupPhotoUrls?.length ?? 0) > 0 ||
                  (r.arrivalPhotoUrls?.length ?? 0) > 0;
                return (
                  <Button
                    type="link"
                    size="small"
                    disabled={!hasAny}
                    icon={<FileImageOutlined />}
                    onClick={() => setEvidenceVin(r)}
                  >
                    {t('inbound.detail.evidence.view')}
                  </Button>
                );
              },
            },
          ]}
        />
      </Card>

      <Drawer
        title={
          evidenceVin
            ? `${t('inbound.detail.evidence.title')} · ${evidenceVin.vin}`
            : t('inbound.detail.evidence.title')
        }
        width={720}
        open={!!evidenceVin}
        onClose={() => setEvidenceVin(null)}
        destroyOnClose
      >
        {evidenceVin && <EvidenceViewer sections={evidenceSections} />}
      </Drawer>
    </div>
  );
}

export default function InboundOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return <InboundOrderDetail id={params.id} />;
}
