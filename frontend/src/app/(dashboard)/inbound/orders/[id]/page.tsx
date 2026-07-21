'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileImageOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { Permission, usePermission } from '@/lib/auth/permissions';
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
  status: 'ACTIVE' | 'CANCELLED';
  cancelledAt: string | null;
  cancelledByUser?: { id: string; displayName: string } | null;
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
  const router = useRouter();
  const canEdit = usePermission(Permission.INBOUND_IMPORT);
  const [order, setOrder] = useState<OrderHead | null>(null);
  const [vins, setVins] = useState<InboundOrderVinDetail[]>([]);
  const [totals, setTotals] = useState<{
    total: number;
    arrived: number;
    pickedUp: number;
    cancelled: number;
  }>({ total: 0, arrived: 0, pickedUp: 0, cancelled: 0 });
  const [loading, setLoading] = useState(false);
  const [evidenceVin, setEvidenceVin] = useState<InboundOrderVinDetail | null>(null);
  const evidenceSections = useMemo(
    () => (evidenceVin ? buildEvidenceSections(evidenceVin, t) : []),
    [evidenceVin, t],
  );

  // 搜索 + 状态过滤（后端过滤，keyword 匹配 vin/model/color/motorNo/dealer*）
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'EXPECTED' | 'ARRIVED' | 'CANCELLED'
  >('ALL');

  // 编辑 VIN Modal
  const [editing, setEditing] = useState<InboundOrderVinDetail | null>(null);
  const [editForm] = Form.useForm();

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    inboundApi
      .orderDetail(id, {
        keyword: keyword.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      })
      .then((data) => {
        setOrder(data.order as OrderHead);
        setVins(data.vins);
        setTotals(data.totals);
      })
      .catch(() => message.error(t('inbound.detail.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, keyword, statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (v: InboundOrderVinDetail) => {
    setEditing(v);
    editForm.setFieldsValue({
      brand: v.brand ?? '',
      model: v.model ?? '',
      color: v.color ?? '',
      vehicleType: v.vehicleType ?? '',
      motorNo: v.motorNo ?? '',
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    const values = await editForm.validateFields();
    try {
      await inboundApi.updateOrderVin(id, editing.id, values);
      message.success(t('inbound.detail.editSuccess'));
      setEditing(null);
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.detail.editFailed'));
    }
  };

  const onCancelVin = async (v: InboundOrderVinDetail) => {
    try {
      await inboundApi.cancelOrderVin(id, v.id);
      message.success(t('inbound.detail.cancelVinOk'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.detail.cancelVinFailed'));
    }
  };

  const onCancelOrder = async () => {
    try {
      await inboundApi.cancelOrder(id);
      message.success(t('inbound.detail.cancelOrderOk'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.detail.cancelOrderFailed'));
    }
  };

  const { total, arrived, pickedUp, cancelled } = totals;
  const isCancelled = order?.status === 'CANCELLED';
  // 取消整单：ACTIVE 且没有到仓的车 (取消保留订单壳；已到仓的车先撤销入库)
  const canCancelOrder =
    canEdit && !isCancelled && total > 0 && arrived === 0 && cancelled === 0;

  if (!order && !loading) return null;

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>
          {t('inbound.detail.title')}: {order?.orderCode}
        </h2>
        <Space>
          {isCancelled && canEdit && (
            <Link href={`/inbound/import?reactivateOrderId=${id}`}>
              <Button type="primary" icon={<ImportOutlined />}>
                {t('inbound.detail.reactivate')}
              </Button>
            </Link>
          )}
          {canCancelOrder && (
            <Popconfirm
              title={t('inbound.detail.cancelOrderTitle')}
              description={t('inbound.detail.cancelOrderHint', { n: total })}
              okText={t('inbound.detail.cancelOrderOk')}
              okButtonProps={{ danger: true }}
              onConfirm={onCancelOrder}
            >
              <Button danger icon={<DeleteOutlined />}>
                {t('inbound.detail.cancelOrder')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {isCancelled && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('inbound.detail.cancelledBanner')}
          description={
            <div style={{ fontSize: 13 }}>
              {order?.cancelledByUser?.displayName
                ? t('inbound.detail.cancelledBy', {
                    by: order.cancelledByUser.displayName,
                  })
                : ''}
              {order?.cancelledAt
                ? ` · ${new Date(order.cancelledAt).toLocaleString()}`
                : ''}
              <div style={{ marginTop: 4, color: '#94a3b8' }}>
                {t('inbound.detail.cancelledHint')}
              </div>
            </div>
          }
        />
      )}

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
          <Descriptions.Item label={t('inbound.detail.importedAt')}>
            {order?.createdAt ? new Date(order.createdAt).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('inbound.detail.remark')} span={2}>
            {order?.remark ?? '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={t('inbound.detail.vinList')}
        extra={
          <Space size="small">
            <Segmented
              size="small"
              value={statusFilter}
              onChange={(v) =>
                setStatusFilter(v as 'ALL' | 'EXPECTED' | 'ARRIVED' | 'CANCELLED')
              }
              options={[
                { label: t('inbound.detail.filterAll'), value: 'ALL' },
                { label: t('inbound.detail.status.EXPECTED'), value: 'EXPECTED' },
                { label: t('inbound.detail.status.ARRIVED'), value: 'ARRIVED' },
                { label: t('inbound.detail.status.CANCELLED'), value: 'CANCELLED' },
              ]}
            />
            <Input.Search
              size="small"
              style={{ width: 260 }}
              allowClear
              placeholder={t('inbound.detail.searchPlaceholder')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => load()}
            />
          </Space>
        }
      >
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
              width: 200,
              render: (_: unknown, r: InboundOrderVinDetail) => {
                const tag = (
                  <Tag color={STATUS_COLORS[r.arrivalStatus]}>
                    {t(`inbound.detail.status.${r.arrivalStatus}`)}
                  </Tag>
                );
                if (r.arrivalStatus !== 'CANCELLED') return tag;
                // 已取消 VIN 直接把审计信息展示在下面，避免 hover 才可见
                return (
                  <div>
                    {tag}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {r.cancelledByUser?.displayName ?? '-'}
                      {r.cancelledAt
                        ? ` · ${new Date(r.cancelledAt).toLocaleString()}`
                        : ''}
                    </div>
                  </div>
                );
              },
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
            ...(canEdit
              ? [
                  {
                    title: '',
                    width: 140,
                    render: (_: unknown, r: InboundOrderVinDetail) => {
                      // 只有 EXPECTED + 未占用 才允许改/删（后端会二次校验）
                      const editable =
                        r.arrivalStatus === 'EXPECTED' && !r.isAllocated;
                      if (!editable) return null;
                      return (
                        <Space size={4}>
                          <Button
                            type="link"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openEdit(r)}
                          >
                            {t('inbound.detail.editVin')}
                          </Button>
                          <Popconfirm
                            title={t('inbound.detail.cancelVinTitle')}
                            onConfirm={() => onCancelVin(r)}
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              type="link"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                            >
                              {t('inbound.detail.cancelVin')}
                            </Button>
                          </Popconfirm>
                        </Space>
                      );
                    },
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <Modal
        title={editing ? `${t('inbound.detail.editVinTitle')} · ${editing.vin}` : ''}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        okText={t('inbound.detail.saveEdit')}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label={t('inbound.detail.field.brand')} name="brand">
                <Input maxLength={60} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('inbound.detail.field.model')} name="model">
                <Input maxLength={120} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('inbound.detail.field.color')} name="color">
                <Input maxLength={60} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t('inbound.detail.field.vehicleType')}
                name="vehicleType"
              >
                <Input maxLength={60} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={t('inbound.detail.field.motorNo')} name="motorNo">
                <Input maxLength={60} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

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
