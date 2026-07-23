'use client';

import { useEffect, useState } from 'react';
import { Modal, message } from 'antd';
import { waybillsApi, type Waybill } from '@/lib/api/waybills';
import { DriverVehiclePicker } from '@/components/carriers/DriverVehiclePicker';
import { useTranslation } from '@/i18n/useTranslation';

// 分派司机/拖车弹窗：接管抽屉 + 运单列表两处调用
// 只允许 NOT_ARRIVED + !isLocked 的运单调 (调用方过滤按钮显示；后端二次校验)
interface Props {
  waybill: Waybill | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function AssignWaybillModal({ waybill, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 打开时用当前运单值回填；关闭时置 null
  useEffect(() => {
    if (waybill) {
      setDriverId(waybill.driver?.id ?? null);
      setVehicleId(waybill.vehicle?.id ?? null);
    } else {
      setDriverId(null);
      setVehicleId(null);
    }
  }, [waybill]);

  const submit = async () => {
    if (!waybill) return;
    setSubmitting(true);
    try {
      await waybillsApi.assign(waybill.id, { driverId, vehicleId });
      message.success(t('waybills.detail.assignOk'));
      onSaved?.();
      onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('waybills.detail.assignFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        waybill
          ? `${t('waybills.detail.assignTitle')} · ${waybill.waybillCode}`
          : t('waybills.detail.assignTitle')
      }
      open={!!waybill}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={submitting}
      destroyOnClose
    >
      <DriverVehiclePicker
        carrierId={waybill?.carrierId ?? undefined}
        driverId={driverId}
        vehicleId={vehicleId}
        onChange={(v) => {
          setDriverId(v.driverId);
          setVehicleId(v.vehicleId);
        }}
      />
    </Modal>
  );
}
