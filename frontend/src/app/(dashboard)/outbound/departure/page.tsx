'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { VinScanner } from '@/components/scan/VinScanner';
import { PhotoUpload } from '@/components/scan/PhotoUpload';
import { waybillsApi, Waybill } from '@/lib/api/waybills';
import { useTranslation } from '@/i18n/useTranslation';

// 出库启运 H5：场地业务员在始发仓，一辆拖车装完车 → 扫任一 VIN + 拍 SJ 凭证
// → 整张运单进入 IN_TRANSIT + 所有 slot 释放
// 后端 applyWaybillScope 会按 YARD_STAFF 的 scopeYardId 自动过滤本场地运单
export default function OutboundDeparturePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Waybill | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedVin, setScannedVin] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = () => {
    setLoading(true);
    waybillsApi
      .list({ status: 'NOT_ARRIVED', transportType: 'DELIVERY' })
      .then(setRows)
      .catch(() => message.error(t('outbound.departure.loadFailed')))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openScan = (w: Waybill) => {
    setSelected(w);
    setScannedVin('');
    setPhotos([]);
    setRemark('');
    setScanOpen(true);
  };

  const onVinScanned = (v: string) => {
    if (!selected) return;
    // 扫的 VIN 必须属于这张运单
    const belongs = selected.vins.some((wv) => wv.vin === v);
    if (!belongs) {
      message.warning(t('outbound.departure.vinNotInWaybill'));
      return;
    }
    setScannedVin(v);
  };

  const submit = async () => {
    if (!selected || !scannedVin) return;
    if (photos.length === 0) {
      message.warning(t('outbound.departure.needPhoto'));
      return;
    }
    setSubmitting(true);
    try {
      await waybillsApi.scan({
        vin: scannedVin,
        action: 'DELIVERY_DEPARTURE',
        yardId: selected.originYardId ?? undefined,
        attachmentUrls: photos,
        remark: remark || undefined,
      });
      message.success(t('outbound.departure.success'));
      setScanOpen(false);
      setSelected(null);
      reload();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('outbound.departure.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('outbound.departure.title')}
        subtitle={t('outbound.departure.subtitle')}
      />

      <Card>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rows}
          expandable={{
            expandedRowRender: (w) => (
              <Descriptions
                column={2}
                size="small"
                style={{ background: '#f8fafc', padding: 12, borderRadius: 6 }}
              >
                <Descriptions.Item label={t('outbound.departure.originYard')}>
                  {w.originYard?.name ?? w.originText ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('outbound.departure.dealer')}>
                  {w.destinationDealer?.dealerName ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('outbound.departure.carrier')}>
                  {w.carrier?.name ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('outbound.departure.vinCount')}>
                  {w.vins.length}
                </Descriptions.Item>
                <Descriptions.Item label="VIN" span={2}>
                  <Space wrap>
                    {w.vins.map((v) => (
                      <Tag key={v.id}>{v.vin}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            ),
          }}
          columns={[
            {
              title: t('outbound.departure.waybillCode'),
              dataIndex: 'waybillCode',
              width: 200,
            },
            {
              title: t('outbound.departure.originYard'),
              render: (_, w: Waybill) =>
                w.originYard?.name ?? w.originText ?? '-',
            },
            {
              title: t('outbound.departure.dealer'),
              render: (_, w: Waybill) =>
                w.destinationDealer?.dealerName ?? '-',
            },
            {
              title: t('outbound.departure.carrier'),
              render: (_, w: Waybill) => w.carrier?.name ?? '-',
            },
            {
              title: t('outbound.departure.vinCount'),
              render: (_, w: Waybill) => (
                <Tag>{w.vins.length} {t('outbound.departure.vehicles')}</Tag>
              ),
            },
            {
              title: '',
              width: 130,
              render: (_, w: Waybill) => (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => openScan(w)}
                >
                  {t('outbound.departure.startScan')}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={
          selected
            ? `${t('outbound.departure.scanTitle')} · ${selected.waybillCode}`
            : t('outbound.departure.scanTitle')
        }
        open={scanOpen}
        onCancel={() => setScanOpen(false)}
        footer={null}
        destroyOnHidden
        width={520}
      >
        {selected && (
          <div>
            <Alert
              type="info"
              message={t('outbound.departure.scanHint', {
                n: selected.vins.length,
              })}
              style={{ marginBottom: 12 }}
            />

            {!scannedVin && (
              <VinScanner
                onScan={onVinScanned}
                placeholder={t('outbound.departure.vinPlaceholder')}
              />
            )}

            {scannedVin && (
              <div>
                <div
                  style={{
                    background: '#f0fdf4',
                    padding: 10,
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {t('outbound.departure.scannedVin')}
                  </div>
                  <strong style={{ fontSize: 15 }}>{scannedVin}</strong>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 6, fontWeight: 500 }}>
                    {t('outbound.departure.sjPhoto')}{' '}
                    <Tag color="red">
                      {t('outbound.departure.required')}
                    </Tag>
                  </div>
                  <PhotoUpload value={photos} onChange={setPhotos} />
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    {t('outbound.departure.sjPhotoHint')}
                  </div>
                </div>

                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    loading={submitting}
                    disabled={photos.length === 0}
                    onClick={submit}
                  >
                    {t('outbound.departure.confirmDeparture', {
                      n: selected.vins.length,
                    })}
                  </Button>
                  <Button
                    block
                    onClick={() => {
                      setScannedVin('');
                      setPhotos([]);
                    }}
                  >
                    {t('outbound.departure.rescan')}
                  </Button>
                </Space>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
