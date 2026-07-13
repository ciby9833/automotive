'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Space,
  Tag,
  message,
} from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  inboundApi,
  InboundOrderVinDetail,
} from '@/lib/api/inbound';
import { VinScanner } from '@/components/scan/VinScanner';
import { PhotoUpload } from '@/components/scan/PhotoUpload';
import { useTranslation } from '@/i18n/useTranslation';

// 供应商司机 H5 提货扫描页
// 流程: 扫 VIN → 显示车辆信息 + 可否提货 → 拍照/备注 → 确认提货
export default function PickupScanPage() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<'scan' | 'confirm' | 'done'>('scan');
  const [vinInfo, setVinInfo] = useState<InboundOrderVinDetail | null>(null);
  const [lookupReason, setLookupReason] = useState<string | null>(null);
  const [canPickup, setCanPickup] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStage('scan');
    setVinInfo(null);
    setLookupReason(null);
    setCanPickup(false);
    setPhotos([]);
    setRemark('');
    setLocation('');
  };

  const onScanned = async (vin: string) => {
    try {
      const res = await inboundApi.pickupLookup(vin);
      setVinInfo(res.vin);
      setCanPickup(res.canPickup);
      setLookupReason(res.reason ?? null);
      setStage('confirm');
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('pickup.lookupFailed'));
    }
  };

  const confirm = async () => {
    if (!vinInfo) return;
    if (photos.length === 0) {
      message.warning(t('pickup.needPhoto'));
      return;
    }
    setSubmitting(true);
    try {
      await inboundApi.pickupScan({
        vin: vinInfo.vin,
        location: location || undefined,
        photoUrls: photos,
        remark: remark || undefined,
      });
      setStage('done');
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('pickup.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 16 }}>{t('pickup.title')}</h2>

      {stage === 'scan' && (
        <Card>
          <VinScanner onScan={onScanned} />
        </Card>
      )}

      {stage === 'confirm' && vinInfo && (
        <Card>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="VIN">
              <strong style={{ fontSize: 15 }}>{vinInfo.vin}</strong>
            </Descriptions.Item>
            <Descriptions.Item label={t('pickup.brand')}>
              {vinInfo.brand ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('pickup.model')}>
              {vinInfo.model ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('pickup.color')}>
              {vinInfo.color ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('pickup.motorNo')}>
              {vinInfo.motorNo ?? '-'}
            </Descriptions.Item>
          </Descriptions>

          {!canPickup ? (
            <>
              <Alert
                type="error"
                message={t('pickup.cannotPickup')}
                description={lookupReason}
                style={{ marginBottom: 12 }}
              />
              <Button block onClick={reset}>
                {t('pickup.scanAnother')}
              </Button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>
                  {t('pickup.location')}
                </div>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('pickup.locationPlaceholder')}
                  size="large"
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>
                  {t('pickup.photos')} <Tag color="red">{t('pickup.required')}</Tag>
                </div>
                <PhotoUpload value={photos} onChange={setPhotos} />
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {t('pickup.photoHint')}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>
                  {t('pickup.remark')}
                </div>
                <Input.TextArea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  placeholder={t('pickup.remarkPlaceholder')}
                />
              </div>

              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<CheckCircleOutlined />}
                  loading={submitting}
                  disabled={photos.length === 0}
                  onClick={confirm}
                >
                  {t('pickup.confirm')}
                </Button>
                <Button block onClick={reset}>
                  {t('pickup.scanAnother')}
                </Button>
              </Space>
            </>
          )}
        </Card>
      )}

      {stage === 'done' && vinInfo && (
        <Card>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#16a34a' }} />
            <h3 style={{ marginTop: 12 }}>{t('pickup.doneTitle')}</h3>
            <div style={{ color: '#64748b' }}>
              {vinInfo.vin} · {vinInfo.brand} {vinInfo.model}
            </div>
          </div>
          <Button
            type="primary"
            size="large"
            block
            icon={<ReloadOutlined />}
            onClick={reset}
          >
            {t('pickup.scanNext')}
          </Button>
        </Card>
      )}
    </div>
  );
}
