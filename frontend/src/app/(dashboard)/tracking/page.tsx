'use client';

import { useState } from 'react';
import {
  Alert,
  Avatar,
  Card,
  Empty,
  Image as AntdImage,
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
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  ImportOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { trackingApi, TimelineEntry } from '@/lib/api/tracking';
import { getStorageUrl } from '@/lib/api/client';
import { useTranslation } from '@/i18n/useTranslation';
import { formatSlotCode } from '@/lib/slots';

// 全生命周期轨迹页：VIN 或订单号查询 → 归一化时间线（照片墙 + 场地/库位 + 操作人 + 备注）
type SearchMode = 'vin' | 'order';

// 事件类型 → 图标 + 颜色。type 是 OperationType 或 ScanAction 字符串
function iconOf(type: string): { icon: React.ReactNode; color: string } {
  if (type === 'INBOUND_ORDER_IMPORT' || type === 'OUTBOUND_ORDER_IMPORT')
    return { icon: <ImportOutlined />, color: '#3b82f6' };
  if (type.endsWith('CANCEL'))
    return { icon: <CloseCircleOutlined />, color: '#ef4444' };
  if (type === 'INBOUND_VIN_EDIT')
    return { icon: <EditOutlined />, color: '#f59e0b' };
  if (type === 'PICKUP_SCAN')
    return { icon: <ShoppingCartOutlined />, color: '#8b5cf6' };
  if (type === 'PICKUP_ASSIGN' || type === 'PICKUP_COMPLETE')
    return { icon: <CheckCircleOutlined />, color: '#0891b2' };
  if (type === 'INBOUND_SCAN' || type === 'INBOUND_UNEXPECTED')
    return { icon: <BuildOutlined />, color: '#16a34a' };
  if (type === 'INBOUND_UNDO')
    return { icon: <UndoOutlined />, color: '#f59e0b' };
  if (type === 'YARD_MOVE') return { icon: <SwapOutlined />, color: '#0ea5e9' };
  if (type === 'WAYBILL_PLAN' || type === 'WAYBILL_ASSIGN')
    return { icon: <CarOutlined />, color: '#6366f1' };
  if (type.includes('LOAD'))
    return { icon: <CameraOutlined />, color: '#0ea5e9' };
  if (type.includes('DEPART') || type === 'DELIVERY_DEPARTURE')
    return { icon: <SendOutlined />, color: '#22c55e' };
  if (type.includes('SIGN'))
    return { icon: <CheckCircleOutlined />, color: '#22c55e' };
  return { icon: <CarOutlined />, color: '#64748b' };
}

// 白名单 payload 键 → 展示 label（i18n 兜底走 key 原文）
const PAYLOAD_KEYS: Array<[string, string]> = [
  ['orderCode', '订单号'],
  ['waybillCode', '运单号'],
  ['strayOrderCode', '散车单号'],
  ['dealerName', '经销店'],
  ['dealerCode', 'Dealer Code'],
  ['towType', '拖车类型'],
  ['groupCode', '分组'],
  ['brand', '品牌'],
  ['model', '车型'],
  ['color', '颜色'],
  ['slotCode', '库位'],
  ['fromSlotCode', '原库位'],
  ['toSlotCode', '新库位'],
  ['carrierId', '承运商'],
  ['taskOrderId', '任务单'],
  ['outOfOrder', '订单外扫码'],
  ['location', '地点'],
  ['pickupLatitude', '纬度'],
  ['pickupLongitude', '经度'],
  ['created', '新增'],
  ['skipped', '跳过'],
  ['matched', '匹配'],
  ['missingCount', '缺失'],
  ['bulk', '批量'],
];

function renderPayload(
  payload: Record<string, unknown> | null,
): React.ReactNode {
  if (!payload) return null;
  const items: React.ReactNode[] = [];
  for (const [key, label] of PAYLOAD_KEYS) {
    const v = payload[key];
    if (v === null || v === undefined || v === '') continue;
    items.push(
      <span
        key={key}
        style={{
          fontSize: 12,
          color: '#475569',
          marginRight: 12,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#94a3b8' }}>{label}:</span>{' '}
        {typeof v === 'boolean' ? (v ? '是' : '否') : String(v)}
      </span>,
    );
  }
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap' }}>
      {items}
    </div>
  );
}

// 附件缩略图墙：4-per-row，点开原图预览。attachmentUrls 里存的是 storage key，
// 用 getStorageUrl 转成完整 URL（走 /storage/preview/:key 由后端流式转发）
function renderAttachments(urls: string[] | null): React.ReactNode {
  if (!urls || urls.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <AntdImage.PreviewGroup>
        <Space wrap size={6}>
          {urls.map((u, i) => {
            const full = getStorageUrl(u);
            return (
              <AntdImage
                key={`${u}-${i}`}
                src={full}
                preview={{ src: full }}
                alt={`attachment-${i}`}
                width={72}
                height={72}
                style={{
                  objectFit: 'cover',
                  borderRadius: 4,
                  border: '1px solid #e2e8f0',
                }}
                fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24' fill='%23cbd5e1'><path d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/></svg>"
              />
            );
          })}
        </Space>
      </AntdImage.PreviewGroup>
    </div>
  );
}

// 车况快照 (vehicleCheckInfo / 或 waybill 扫码里的电量里程等)
function renderVehicleCheck(
  payload: Record<string, unknown> | null,
): React.ReactNode {
  if (!payload) return null;
  const vc =
    (payload.vehicleCheckInfo as Record<string, unknown> | undefined) ??
    (typeof payload.batteryLevel === 'number' ||
    typeof payload.odometer === 'number'
      ? payload
      : undefined);
  if (!vc) return null;
  const parts: React.ReactNode[] = [];
  if (vc.batteryLevel !== undefined) {
    parts.push(
      <Tag key="b" color="green">
        电量 {String(vc.batteryLevel)}%
      </Tag>,
    );
  }
  if (vc.odometer !== undefined) {
    parts.push(
      <Tag key="o" color="cyan">
        里程 {String(vc.odometer)} km
      </Tag>,
    );
  }
  if (vc.appearance) {
    parts.push(
      <Tag key="a" color="orange">
        外观 {String(vc.appearance)}
      </Tag>,
    );
  }
  if (parts.length === 0) return null;
  return <div style={{ marginTop: 6 }}>{parts}</div>;
}

function initialsOf(name?: string): string {
  if (!name) return '?';
  return name.slice(0, 1).toUpperCase();
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
            <Empty
              description={t('tracking.noResult')}
              style={{ padding: 24 }}
            />
          )}
          {entries.length > 0 && (
            <Timeline
              mode="left"
              items={entries.map((e, i) => {
                const meta = iconOf(e.type);
                const occurred = new Date(e.occurredAt);
                const created = new Date(e.createdAt);
                // 事件发生 vs 记录写入相差 > 1 分钟标"补录"提示
                const isBackdated =
                  Math.abs(created.getTime() - occurred.getTime()) > 60_000;
                return {
                  key: `${e.occurredAt}-${i}`,
                  color: meta.color,
                  dot: meta.icon as React.ReactElement,
                  label: (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        textAlign: 'right',
                      }}
                    >
                      <div>{occurred.toLocaleString()}</div>
                      {isBackdated && (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>
                          补录于 {created.toLocaleString()}
                        </div>
                      )}
                    </div>
                  ),
                  children: (
                    <div style={{ paddingBottom: 4 }}>
                      <Space size={6} wrap>
                        <Tag color={meta.color}>
                          {(() => {
                            const localized = t(`tracking.type.${e.type}`);
                            return localized === `tracking.type.${e.type}`
                              ? e.type
                              : localized;
                          })()}
                        </Tag>
                        {e.vin && (
                          <span
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                          >
                            {e.vin}
                          </span>
                        )}
                        {e.yard && (
                          <Tag color="geekblue">
                            {e.yard.name}
                            {e.slot ? ` · ${formatSlotCode(e.slot)}` : ''}
                          </Tag>
                        )}
                        {e.operator && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Avatar
                              size={18}
                              style={{
                                background: '#e2e8f0',
                                color: '#475569',
                                fontSize: 11,
                              }}
                            >
                              {initialsOf(e.operator.displayName)}
                            </Avatar>
                            <Typography.Text
                              type="secondary"
                              style={{ fontSize: 12 }}
                            >
                              {e.operator.displayName}
                            </Typography.Text>
                          </span>
                        )}
                      </Space>
                      {renderPayload(e.payload)}
                      {renderVehicleCheck(e.payload)}
                      {renderAttachments(e.attachmentUrls)}
                      {e.remark && (
                        <div
                          style={{
                            fontSize: 12,
                            color: '#64748b',
                            marginTop: 6,
                          }}
                        >
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
