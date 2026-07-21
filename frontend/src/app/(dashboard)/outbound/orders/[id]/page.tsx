'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'antd';
import { DeleteOutlined, PartitionOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { outboundApi, OutboundOrderVinDetail } from '@/lib/api/outbound';
import { useTranslation } from '@/i18n/useTranslation';
import { Permission, usePermission } from '@/lib/auth/permissions';

// 出库订单详情：订单头 + 关联 VIN 表 + 4 项统计 + 去开单按钮
// VIN 关联规则：软关联 (客户 + customerOrderNo + dealer_code)，因 OrderVin.orderId 挂的是入库单
interface OrderHead {
  id: string;
  orderCode: string;
  customerOrderNo: string | null;
  createdAt: string;
  remark: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancelledAt: string | null;
  cancelledByUser?: { id: string; displayName: string } | null;
  customer?: { id: string; name: string };
  destinationYard?: { id: string; name: string; code: string };
  organization?: { id: string; name: string; code: string };
}

export function OutboundOrderDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const canImport = usePermission(Permission.OUTBOUND_IMPORT);
  const [order, setOrder] = useState<OrderHead | null>(null);
  const [vins, setVins] = useState<OutboundOrderVinDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    outboundApi
      .orderDetail(id)
      .then((data) => {
        setOrder(data.order as OrderHead);
        setVins(data.vins ?? []);
      })
      .catch(() => message.error(t('outbound.detail.loadFailed')))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = vins.length;
  const arrived = vins.filter((v) => v.arrivalStatus === 'ARRIVED').length;
  const allocated = vins.filter((v) => v.isAllocated).length;
  const pendingPlan = arrived - allocated;
  const isCancelled = order?.status === 'CANCELLED';
  const canCancel = canImport && !isCancelled && allocated === 0;

  const onCancel = async () => {
    try {
      await outboundApi.cancelOrder(id);
      message.success(t('outbound.detail.cancelOk'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.detail.cancelFailed'));
    }
  };

  if (!order && !loading) return null;

  return (
    <div>
      <PageHeader
        title={`${t('outbound.detail.title')}: ${order?.orderCode ?? ''}`}
        actions={
          <Space>
            {!isCancelled && (
              <Link href={`/outbound/plan?orderId=${id}`}>
                <Button type="primary" icon={<PartitionOutlined />}>
                  {t('outbound.detail.goToPlan')}
                </Button>
              </Link>
            )}
            {canCancel && (
              <Popconfirm
                title={t('outbound.detail.cancelTitle')}
                description={t('outbound.detail.cancelHint', { n: total })}
                okText={t('outbound.detail.cancelOk')}
                okButtonProps={{ danger: true }}
                onConfirm={onCancel}
              >
                <Button danger icon={<DeleteOutlined />}>
                  {t('outbound.detail.cancel')}
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />

      {isCancelled && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('outbound.detail.cancelledBanner')}
          description={
            <div style={{ fontSize: 13 }}>
              {order?.cancelledByUser?.displayName
                ? t('outbound.detail.cancelledBy', {
                    by: order.cancelledByUser.displayName,
                  })
                : ''}
              {order?.cancelledAt
                ? ` · ${new Date(order.cancelledAt).toLocaleString()}`
                : ''}
              <div style={{ marginTop: 4, color: '#94a3b8' }}>
                {t('outbound.detail.cancelledHint')}
              </div>
            </div>
          }
        />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('outbound.detail.totalVins')}
              value={total}
              suffix={t('outbound.detail.vehicles')}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('outbound.detail.arrived')}
              value={arrived}
              suffix={`/ ${total}`}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('outbound.detail.pendingPlan')}
              value={pendingPlan}
              valueStyle={{ color: '#f59e0b' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('outbound.detail.allocated')}
              value={allocated}
              suffix={`/ ${arrived}`}
              valueStyle={{ color: '#2563eb' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t('outbound.detail.orderHead')} style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={t('outbound.detail.customer')}>
            {order?.customer?.name ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('outbound.detail.customerOrderNo')}>
            {order?.customerOrderNo ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('outbound.detail.originYard')}>
            {order?.destinationYard
              ? `${order.destinationYard.name} (${order.destinationYard.code})`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('outbound.detail.organization')}>
            {order?.organization?.name ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('outbound.detail.remark')} span={2}>
            {order?.remark ?? '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={t('outbound.detail.vinList')}>
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
              render: (_, r) =>
                [r.brand, r.model].filter(Boolean).join(' / ') || '-',
            },
            { title: 'Color', dataIndex: 'color' },
            {
              title: t('outbound.detail.dealer'),
              render: (_, r) =>
                r.dealerName ? (
                  <div>
                    <div style={{ fontSize: 13 }}>{r.dealerName}</div>
                    {r.dealerCode && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {r.dealerCode}
                      </div>
                    )}
                  </div>
                ) : (
                  '-'
                ),
            },
            {
              title: t('outbound.detail.towType'),
              dataIndex: 'towType',
              render: (v: string | null) =>
                v ? <Tag color="blue">{v}</Tag> : '-',
            },
            {
              title: t('outbound.detail.group'),
              dataIndex: 'groupCode',
              render: (v: string | null) =>
                v ? <Tag color="purple">{v}</Tag> : '-',
            },
            {
              title: t('outbound.detail.slot'),
              render: (_, r) =>
                r.slot ? (
                  <Tag color="green">{r.slot.code}</Tag>
                ) : (
                  <span style={{ color: '#94a3b8' }}>-</span>
                ),
            },
            {
              title: t('outbound.detail.planStatus'),
              render: (_, r) => {
                if (r.arrivalStatus !== 'ARRIVED') {
                  return <Tag color="default">{t('outbound.detail.notArrived')}</Tag>;
                }
                if (r.isAllocated) {
                  return <Tag color="blue">{t('outbound.detail.planned')}</Tag>;
                }
                return <Tag color="orange">{t('outbound.detail.awaitingPlan')}</Tag>;
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}

export default function OutboundOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return <OutboundOrderDetail id={params.id} />;
}
