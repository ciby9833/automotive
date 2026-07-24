'use client';

import { useEffect, useState } from 'react';
import {
  DatePicker,
  Form,
  Modal,
  Select,
  message,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { inboundApi } from '@/lib/api/inbound';
import { carriersApi, Carrier } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  open: boolean;
  orderId: string | null;
  // 打开时若已有分派，回填
  current?: {
    pickupCarrierId: string | null;
    pickupDriverUserName: string | null;
    plannedPickupDate: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

// HQ / ORG_ADMIN 给入库订单分派提货承运商
// MVP 版本：只选承运商 + 计划日；司机维度暂不精细到人（承运商内共享），符合 batch1 后端实现
// 未来可以按 pickupCarrierId 加载承运商侧司机列表（需要 User 表按 carrier 过滤）
export function AssignPickupModal({
  open,
  orderId,
  current,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrierId, setCarrierId] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState<Dayjs | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    carriersApi.list().then(setCarriers).catch(() => setCarriers([]));
    setCarrierId(current?.pickupCarrierId ?? null);
    setPlannedDate(
      current?.plannedPickupDate ? dayjs(current.plannedPickupDate) : null,
    );
  }, [open, current?.pickupCarrierId, current?.plannedPickupDate]);

  const submit = async () => {
    if (!orderId) return;
    setSubmitting(true);
    try {
      await inboundApi.assignPickup(orderId, {
        pickupCarrierId: carrierId, // null 表示解除
        plannedPickupDate: plannedDate
          ? plannedDate.format('YYYY-MM-DD')
          : undefined,
      });
      message.success(t('inbound.detail.assignPickupOk'));
      onSaved();
      onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('inbound.detail.assignPickupFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('inbound.detail.assignPickupTitle')}
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item
          label={t('inbound.detail.assignPickupCarrier')}
          extra={t('inbound.detail.assignPickupCarrierHint')}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('inbound.detail.assignPickupCarrierPlaceholder')}
            value={carrierId ?? undefined}
            onChange={(v) => setCarrierId(v ?? null)}
            options={carriers.map((c) => ({
              value: c.id,
              label: `${c.name}${c.type === 'SELF_OWNED' ? ' (自营)' : ''}`,
            }))}
          />
        </Form.Item>
        <Form.Item label={t('inbound.detail.plannedPickupDate')}>
          <DatePicker
            style={{ width: '100%' }}
            value={plannedDate}
            onChange={setPlannedDate}
            placeholder={t('inbound.detail.plannedPickupDatePlaceholder')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
