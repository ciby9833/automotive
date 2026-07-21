'use client';

import { useState } from 'react';
import {
  Alert,
  Card,
  Empty,
  Input,
  Segmented,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  BuildOutlined,
  CameraOutlined,
  CarOutlined,
  CloseCircleOutlined,
  EditOutlined,
  ImportOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { trackingApi, TimelineEntry } from '@/lib/api/tracking';
import { useTranslation } from '@/i18n/useTranslation';

// 全生命周期轨迹：按 VIN 或订单号聚合 OperationLog + WaybillStatusLog 时间线
// 每个节点显示时间 / 操作类型 / 操作人 / 详情载荷；照片凭证直接嵌入
type SearchMode = 'vin' | 'order';

// 按 type 分类图标+颜色。type 是 OperationType 或 ScanAction 字符串
function iconOf(type: string): { icon: React.ReactNode; color: string } {
  if (type.startsWith('INBOUND_ORDER_IMPORT') || type.startsWith('OUTBOUND_ORDER_IMPORT'))
    return { icon: <ImportOutlined />, color: '#3b82f6' };
  if (type.endsWith('CANCEL') || type === 'WAYBILL_CANCEL')
    return { icon: <CloseCircleOutlined />, color: '#ef4444' };
  if (type === 'INBOUND_VIN_EDIT') return { icon: <EditOutlined />, color: '#f59e0b' };
  if (type === 'PICKUP_SCAN') return { icon: <ShoppingCartOutlined />, color: '#8b5cf6' };
  if (type === 'INBOUND_SCAN') return { icon: <BuildOutlined />, color: '#16a34a' };
  if (type === 'INBOUND_UNDO') return { icon: <UndoOutlined />, color: '#f59e0b' };
  if (type === 'YARD_MOVE') return { icon: <SwapOutlined />, color: '#0ea5e9' };
  if (type === 'WAYBILL_PLAN') return { icon: <CarOutlined />, color: '#6366f1' };
  if (type.includes('LOAD')) return { icon: <CameraOutlined />, color: '#0ea5e9' };
  if (type.includes('DEPARTURE') || type === 'DELIVERY_DEPARTURE')
    return { icon: <SendOutlined />, color: '#22c55e' };
  return { icon: <CarOutlined />, color: '#64748b' };
}

// 简单渲染 payload 关键字段，避免直接 JSON.stringify 太乱
function renderPayload(type: string, payload: Record<string, unknown> | null): React.ReactNode {
  if (!payload) return null;
  const parts: React.ReactNode[] = [];
  const push = (label: string, val: unknown) => {
    if (val === null || val === undefined || val === '') return;
    parts.push(
      <span key={label} style={{ fontSize: 12, color: '#475569', marginRight: 8 }}>
        <span style={{ color: '#94a3b8' }}>{label}:</span> {String(val)}
      </span>,
    );
  };
  const p = payload as Record<string, unknown>;
  push('orderCode', p.orderCode);
  push('waybillCode', p.waybillCode);
  push('slotCode', p.slotCode);
  push('fromSlot', p.fromSlotCode);
  push('toSlot', p.toSlotCode);
  push('carrier', p.carrierId);
  push('vinCount', p.vinCount);
  push('created', p.created);
  push('skipped', p.skipped);
  push('remark', p.remark);
  return <div style={{ marginTop: 4 }}>{parts}</div>;
}

export default function TrackingPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SearchMode>('vin');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const list =
        mode === 'vin'
          ? await trackingApi.timelineByVin(q)
          : await trackingApi.timelineByOrder(q);
      setEntries(list);
    } catch {
      setEntries([]);
      message.warning(t('tracking.notFound'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('tracking.title')}</h2>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={t('tracking.hint')}
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as SearchMode)}
          options={[
            { label: t('tracking.byVin'), value: 'vin' },
            { label: t('tracking.byOrder'), value: 'order' },
          ]}
        />
        <Input.Search
          allowClear
          placeholder={
            mode === 'vin'
              ? t('tracking.placeholderVin')
              : t('tracking.placeholderOrder')
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={search}
          enterButton={t('tracking.search')}
          style={{ width: 420 }}
        />
      </Space>

      <Card>
        <Spin spinning={loading}>
          {!searched && (
            <Empty description={t('tracking.empty')} style={{ padding: 24 }} />
          )}
          {searched && entries.length === 0 && !loading && (
            <Empty description={t('tracking.noResult')} style={{ padding: 24 }} />
          )}
          {entries.length > 0 && (
            <Timeline
              mode="left"
              items={entries.map((e, i) => {
                const meta = iconOf(e.type);
                return {
                  key: `${e.createdAt}-${i}`,
                  color: meta.color,
                  dot: meta.icon as React.ReactElement,
                  label: (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </div>
                  ),
                  children: (
                    <div>
                      <Space size={6}>
                        <Tag color={meta.color}>
                          {(() => {
                            const localized = t(`tracking.type.${e.type}`);
                            return localized === `tracking.type.${e.type}`
                              ? e.type
                              : localized;
                          })()}
                        </Tag>
                        {e.vin && <span style={{ fontFamily: 'monospace' }}>{e.vin}</span>}
                        {e.operator?.displayName && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            · {e.operator.displayName}
                          </Typography.Text>
                        )}
                      </Space>
                      {renderPayload(e.type, e.payload)}
                      {e.remark && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          {e.remark}
                        </div>
                      )}
                    </div>
                  ),
                };
              })}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
}
