'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  message,
} from 'antd';
import { CheckCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { inboundApi, InboundBatch } from '@/lib/api/inbound';
import { yardsApi, Yard, YardSlot } from '@/lib/api/yards';
import { VinScanner } from '@/components/scan/VinScanner';
import { SlotPicker } from '@/components/scan/SlotPicker';
import { PhotoUpload } from '@/components/scan/PhotoUpload';
import { useAuthStore } from '@/lib/auth/store';
import { useTranslation } from '@/i18n/useTranslation';

// 场地业务员 H5 入库扫描页
// 流程: 选/建批次 → 扫 VIN → 扫库位 → 车检信息(电量/里程/外观) → 拍照 → 确认入库
export default function InboundScanPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [yards, setYards] = useState<Yard[]>([]);
  const [batches, setBatches] = useState<InboundBatch[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const [stage, setStage] = useState<'vin' | 'slot' | 'confirm' | 'done'>('vin');
  const [vin, setVin] = useState<string>('');
  // slot 选择：两种模式互斥。auto 用 zoneCode，manual 用 slotCode
  const [assignMode, setAssignMode] = useState<'auto' | 'manual'>('auto');
  const [slotCode, setSlotCode] = useState<string>('');
  const [zoneCode, setZoneCode] = useState<string>('');
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [assignedSlotCode, setAssignedSlotCode] = useState<string>('');
  const [battery, setBattery] = useState<number | null>(null);
  const [mileage, setMileage] = useState<number | null>(null);
  const [exterior, setExterior] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [batchForm] = Form.useForm();

  useEffect(() => {
    yardsApi.list().then(setYards).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedYardId) return;
    inboundApi.listBatches(selectedYardId).then(setBatches).catch(() => undefined);
    // 拉本场地全 slots 用于 zone 下拉 + 手动模式 SlotPicker (SlotPicker 内部自己会拉，这里冗余无所谓)
    yardsApi.slots(selectedYardId).then(setSlots).catch(() => undefined);
  }, [selectedYardId]);

  // 从 slot code 前缀提取 zone 列表 (如 'A-01' → 'A')；未来若加正式 zone 表再切换
  const zoneOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) {
      const m = s.code.match(/^([A-Za-z0-9]+)[-_ ]/);
      if (m) set.add(m[1].toUpperCase());
    }
    return Array.from(set).sort().map((z) => {
      const vacant = slots.filter(
        (s) => s.code.startsWith(`${z}-`) && s.status === 'VACANT' && !s.isLocked,
      ).length;
      return { value: z, label: `${z} 区 · ${vacant} 个空位` };
    });
  }, [slots]);

  const resetScan = () => {
    setStage('vin');
    setVin('');
    setSlotCode('');
    setZoneCode('');
    setAssignedSlotCode('');
    setBattery(null);
    setMileage(null);
    setExterior('');
    setPhotos([]);
    setRemark('');
  };

  const onVinScanned = (v: string) => {
    setVin(v);
    setStage('slot');
  };

  // 手动模式：SlotPicker 选中 → 直接进 confirm
  const onSlotPicked = (s: string) => {
    setSlotCode(s);
    setStage('confirm');
  };

  // 自动模式：确认所选 zone → 进 confirm (真正的 slot 到 submit 时后端才决定)
  const onZoneConfirmed = () => {
    if (!zoneCode) {
      message.warning(t('inbound.scan.pickZoneFirst'));
      return;
    }
    setStage('confirm');
  };

  const createBatch = async (values: {
    batchCode: string;
    arrivedDate: { format: (f: string) => string };
    notes?: string;
  }) => {
    if (!selectedYardId) return;
    try {
      const batch = await inboundApi.createBatch({
        yardId: selectedYardId,
        batchCode: values.batchCode,
        arrivedDate: values.arrivedDate.format('YYYY-MM-DD'),
        notes: values.notes,
      });
      setBatches([batch, ...batches]);
      setSelectedBatchId(batch.id);
      setNewBatchOpen(false);
      batchForm.resetFields();
      message.success(t('inbound.scan.batchCreated'));
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.scan.batchCreateFailed'));
    }
  };

  const confirm = async () => {
    if (!vin) return;
    if (assignMode === 'manual' && !slotCode) return;
    if (assignMode === 'auto' && !zoneCode) return;
    if (photos.length === 0) {
      message.warning(t('inbound.scan.needPhoto'));
      return;
    }
    setSubmitting(true);
    try {
      const check: Record<string, string | number> = {};
      if (battery !== null) check.battery = battery;
      if (mileage !== null) check.mileage = mileage;
      if (exterior) check.exterior = exterior;
      const result = await inboundApi.inboundScan({
        vin,
        ...(assignMode === 'manual' ? { slotCode } : { zoneCode }),
        inboundBatchId: selectedBatchId ?? undefined,
        vehicleCheckInfo: Object.keys(check).length > 0 ? check : undefined,
        photoUrls: photos,
        remark: remark || undefined,
      });
      // 自动模式：记录后端实际分配的 slot code，done 阶段展示
      setAssignedSlotCode(result.slot?.code ?? '');
      setStage('done');
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.scan.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 16 }}>{t('inbound.scan.title')}</h2>

      {/* 选择场地/批次 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#64748b' }}>
            {t('inbound.scan.yard')}
          </div>
          <Select
            style={{ width: '100%' }}
            value={selectedYardId ?? undefined}
            onChange={(v) => setSelectedYardId(v)}
            placeholder={t('inbound.scan.yardPlaceholder')}
            options={yards.map((y) => ({
              value: y.id,
              label: `${y.name} (${y.code})`,
            }))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#64748b' }}>
            {t('inbound.scan.batch')}
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ flex: 1 }}
              value={selectedBatchId ?? undefined}
              onChange={(v) => setSelectedBatchId(v)}
              disabled={!selectedYardId}
              placeholder={t('inbound.scan.batchPlaceholder')}
              allowClear
              options={batches.map((b) => ({
                value: b.id,
                label: `${b.batchCode} · ${b.arrivedDate}`,
              }))}
            />
            <Button
              icon={<PlusOutlined />}
              disabled={!selectedYardId}
              onClick={() => setNewBatchOpen(true)}
            />
          </Space.Compact>
        </div>
      </Card>

      {stage === 'vin' && (
        <Card title={`1/3 · ${t('inbound.scan.stepScanVin')}`}>
          <VinScanner onScan={onVinScanned} />
        </Card>
      )}

      {stage === 'slot' && (
        <Card title={`2/3 · ${t('inbound.scan.stepPickSlot')}`}>
          <div style={{ marginBottom: 12, padding: 12, background: '#f0fdf4', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>VIN</div>
            <strong>{vin}</strong>
          </div>

          <Radio.Group
            value={assignMode}
            onChange={(e) => setAssignMode(e.target.value)}
            style={{ marginBottom: 12 }}
            buttonStyle="solid"
          >
            <Radio.Button value="auto">
              {t('inbound.scan.modeAuto')}
            </Radio.Button>
            <Radio.Button value="manual">
              {t('inbound.scan.modeManual')}
            </Radio.Button>
          </Radio.Group>

          {assignMode === 'auto' && (
            <div>
              <div style={{ marginBottom: 6, fontSize: 12, color: '#64748b' }}>
                {t('inbound.scan.pickZone')}
              </div>
              <Select
                style={{ width: '100%' }}
                size="large"
                showSearch
                placeholder={t('inbound.scan.zonePlaceholder')}
                value={zoneCode || undefined}
                onChange={setZoneCode}
                options={zoneOptions}
              />
              <div
                style={{
                  fontSize: 12,
                  color: '#94a3b8',
                  marginTop: 4,
                  marginBottom: 12,
                }}
              >
                {t('inbound.scan.autoHint')}
              </div>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  disabled={!zoneCode}
                  onClick={onZoneConfirmed}
                >
                  {t('inbound.scan.confirmZone')}
                </Button>
                <Button block onClick={resetScan}>
                  {t('inbound.scan.reset')}
                </Button>
              </Space>
            </div>
          )}

          {assignMode === 'manual' && (
            <SlotPicker
              yardId={selectedYardId}
              onChange={onSlotPicked}
              onCancel={resetScan}
            />
          )}
        </Card>
      )}

      {stage === 'confirm' && (
        <Card title={`3/3 · ${t('inbound.scan.stepConfirm')}`}>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="VIN">
              <strong>{vin}</strong>
            </Descriptions.Item>
            <Descriptions.Item label={t('inbound.scan.slot')}>
              {assignMode === 'manual' ? (
                <Tag color="green">{slotCode}</Tag>
              ) : (
                <span>
                  <Tag color="blue">{zoneCode} 区</Tag>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {t('inbound.scan.autoAssignNote')}
                  </span>
                </span>
              )}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>
              {t('inbound.scan.vehicleCheck')}
            </div>
            <Space style={{ marginBottom: 8 }}>
              <InputNumber
                min={0}
                max={100}
                value={battery}
                onChange={(v) => setBattery(v)}
                placeholder={t('inbound.scan.battery')}
                addonAfter="%"
                style={{ width: 130 }}
              />
              <InputNumber
                min={0}
                value={mileage}
                onChange={(v) => setMileage(v)}
                placeholder={t('inbound.scan.mileage')}
                addonAfter="km"
                style={{ width: 150 }}
              />
            </Space>
            <Input
              value={exterior}
              onChange={(e) => setExterior(e.target.value)}
              placeholder={t('inbound.scan.exteriorPlaceholder')}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>
              {t('inbound.scan.photos')} <Tag color="red">{t('inbound.scan.required')}</Tag>
            </div>
            <PhotoUpload value={photos} onChange={setPhotos} />
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              {t('inbound.scan.photoHint')}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Input.TextArea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              placeholder={t('inbound.scan.remark')}
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
              {t('inbound.scan.confirm')}
            </Button>
            <Button block onClick={resetScan}>
              {t('inbound.scan.reset')}
            </Button>
          </Space>
        </Card>
      )}

      {stage === 'done' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#16a34a' }} />
            <h3 style={{ marginTop: 12 }}>{t('inbound.scan.doneTitle')}</h3>
            <div style={{ color: '#64748b' }}>
              {vin} →{' '}
              <Tag color="green">
                {assignMode === 'manual' ? slotCode : assignedSlotCode || zoneCode}
              </Tag>
              {assignMode === 'auto' && assignedSlotCode && (
                <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 6 }}>
                  {t('inbound.scan.autoAssignedTo')}
                </span>
              )}
            </div>
          </div>
          <Button
            type="primary"
            size="large"
            block
            icon={<ReloadOutlined />}
            onClick={resetScan}
          >
            {t('inbound.scan.scanNext')}
          </Button>
        </Card>
      )}

      <Modal
        title={t('inbound.scan.newBatchTitle')}
        open={newBatchOpen}
        onCancel={() => setNewBatchOpen(false)}
        onOk={() => batchForm.submit()}
        destroyOnHidden
      >
        <Form form={batchForm} layout="vertical" onFinish={createBatch}>
          <Form.Item
            label={t('inbound.scan.batchCode')}
            name="batchCode"
            rules={[{ required: true }]}
            initialValue={`BATCH-${new Date().toISOString().slice(0, 10)}-${user?.id.slice(0, 4)}`}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('inbound.scan.arrivedDate')}
            name="arrivedDate"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('inbound.scan.notes')} name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {!selectedYardId && (
        <Alert
          type="warning"
          message={t('inbound.scan.selectYardFirst')}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}
