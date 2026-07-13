'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, Descriptions, message } from 'antd';
import { PartitionOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { outboundApi } from '@/lib/api/outbound';
import { useTranslation } from '@/i18n/useTranslation';

// 出库订单头信息展示。
// 注意：出库 Order 不真正持有 VIN 明细 (VIN 一直挂在原入库订单上)，
// 要看车辆池请到 /outbound/plan，那边有可开单 VIN 池 + 客户/仓/经销店/分组筛选
interface OrderHead {
  id: string;
  orderCode: string;
  customerOrderNo: string | null;
  createdAt: string;
  remark: string | null;
  customer?: { id: string; name: string };
  destinationYard?: { id: string; name: string; code: string };
  organization?: { id: string; name: string; code: string };
}

export function OutboundOrderDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderHead | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    outboundApi
      .orderDetail(id)
      .then((data) => setOrder(data.order as OrderHead))
      .catch(() => message.error(t('outbound.detail.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (!order && !loading) return null;

  return (
    <div>
      <PageHeader
        title={`${t('outbound.detail.title')}: ${order?.orderCode ?? ''}`}
        actions={
          <Link href="/outbound/plan">
            <Button type="primary" icon={<PartitionOutlined />}>
              {t('outbound.detail.goToPlan')}
            </Button>
          </Link>
        }
      />

      <Card title={t('outbound.detail.orderHead')}>
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
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: '#f8fafc',
            borderRadius: 6,
            fontSize: 13,
            color: '#475569',
          }}
        >
          {t('outbound.detail.vinPoolHint')}
        </div>
      </Card>
    </div>
  );
}

export default function OutboundOrderDetailPage() {
  const params = useParams<{ id: string }>();
  return <OutboundOrderDetail id={params.id} />;
}
