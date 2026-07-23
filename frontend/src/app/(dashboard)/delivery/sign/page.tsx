'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Space,
  Tag,
  message,
} from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { VinScanner } from '@/components/scan/VinScanner';
import { PhotoUpload } from '@/components/scan/PhotoUpload';
import { waybillsApi, Waybill } from '@/lib/api/waybills';
import { useTranslation } from '@/i18n/useTranslation';

// 签收 H5：司机送到经销店，扫 VIN 由系统自动定位到运单
// 流程：扫 VIN → 展示运单/目的经销店供人肉核对 → 拍签收单(可选) → 确认
// 全部 VIN 签完 → Waybill.status = ARRIVED + isLocked (后端自动)
export default function DeliverySignPage() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<'scan' | 'confirm' | 'done'>('scan');
  const [waybill, setWaybill] = useState<Waybill | null>(null);
  const [vin, setVin] = useState('');
  const [isSigned, setIsSigned] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [allSignedNow, setAllSignedNow] = useState(false);

  const reset = () => {
    setStage('scan');
    setWaybill(null);
    setVin('');
    setIsSigned(false);
    setPhotos([]);
    setRemark('');
    setAllSignedNow(false);
  };

  const onVinScanned = async (v: string) => {
    try {
      const res = await waybillsApi.lookup(v);
      setVin(v);
      setWaybill(res.waybill);
      setIsSigned(res.isSigned);
      setStage('confirm');
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('delivery.sign.lookupFailed'));
    }
  };

  const confirm = async () => {
    if (!waybill || !vin) return;
    setSubmitting(true);
    try {
      const updated = await waybillsApi.scan({
        vin,
        action: 'SIGNED',
        attachmentUrls: photos.length > 0 ? photos : undefined,
        remark: remark || undefined,
      });
      setAllSignedNow(updated.status === 'ARRIVED');
      setStage('done');
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('delivery.sign.signFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <PageHeader title={t('delivery.sign.title')} />

      {stage === 'scan' && (
        <Card>
          <VinScanner
            onScan={onVinScanned}
            placeholder={t('delivery.sign.vinPlaceholder')}
          />
        </Card>
      )}

      {stage === 'confirm' && waybill && (
        <Card>
          {isSigned ? (
            <Alert
              type="warning"
              message={t('delivery.sign.alreadySigned')}
              style={{ marginBottom: 12 }}
            />
          ) : (
            <Alert
              type="info"
              message={t('delivery.sign.confirmHint')}
              style={{ marginBottom: 12 }}
            />
          )}

          <Descriptions
            column={1}
            size="small"
            bordered
            style={{ marginBottom: 12 }}
          >
            <Descriptions.Item label="VIN">
              <strong>{vin}</strong>
            </Descriptions.Item>
            <Descriptions.Item label={t('delivery.sign.waybill')}>
              {waybill.waybillCode}
            </Descriptions.Item>
            <Descriptions.Item label={t('delivery.sign.dealer')}>
              {waybill.destinationDealer ? (
                <div>
                  <div>
                    <strong>{waybill.destinationDealer.dealerName}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {waybill.destinationDealer.address}
                  </div>
                </div>
              ) : waybill.destinationDealerId ? (
                <Tag color="orange">{t('delivery.sign.dealerUnloaded')}</Tag>
              ) : (
                <Tag color="orange">{t('delivery.sign.dealerMissing')}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('delivery.sign.recipientName')}>
              {waybill.recipientName ??
                waybill.destinationDealer?.contactName ??
                '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('delivery.sign.recipientPhone')}>
              {waybill.recipientPhone ??
                waybill.destinationDealer?.contactPhone ??
                '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('delivery.sign.originYard')}>
              {waybill.originYard?.name ?? waybill.originText ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('delivery.sign.progress')}>
              {waybill.vins.filter((v) => v.isSigned).length} /{' '}
              {waybill.vins.length}
            </Descriptions.Item>
          </Descriptions>

          {!isSigned && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>
                  {t('delivery.sign.signPhoto')}
                </div>
                <PhotoUpload value={photos} onChange={setPhotos} />
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {t('delivery.sign.signPhotoHint')}
                </div>
              </div>

              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<CheckCircleOutlined />}
                  loading={submitting}
                  onClick={confirm}
                >
                  {t('delivery.sign.confirmSign')}
                </Button>
                <Button block onClick={reset}>
                  {t('delivery.sign.scanAnother')}
                </Button>
              </Space>
            </>
          )}

          {isSigned && (
            <Button block onClick={reset}>
              {t('delivery.sign.scanAnother')}
            </Button>
          )}
        </Card>
      )}

      {stage === 'done' && waybill && (
        <Card>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircleOutlined
              style={{ fontSize: 48, color: '#16a34a' }}
            />
            <h3 style={{ marginTop: 12 }}>{t('delivery.sign.doneTitle')}</h3>
            <div style={{ color: '#64748b' }}>{vin}</div>
            {allSignedNow && (
              <Alert
                type="success"
                showIcon
                message={t('delivery.sign.allSignedMessage', {
                  waybillCode: waybill.waybillCode,
                })}
                style={{ marginTop: 12 }}
              />
            )}
          </div>
          <Button
            type="primary"
            size="large"
            block
            icon={<ReloadOutlined />}
            onClick={reset}
          >
            {t('delivery.sign.scanNext')}
          </Button>
        </Card>
      )}
    </div>
  );
}
