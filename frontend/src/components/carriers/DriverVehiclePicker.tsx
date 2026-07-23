'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { carriersApi, Driver, Vehicle } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

// 开单/分派场景通用：按承运商加载司机+拖车下拉，附"+新增"快捷入口
// 关键：任何一次 carrierId 变化都会 re-fetch；先清空原选中避免跨承运商张冠李戴
interface Props {
  carrierId: string | undefined;
  driverId: string | null | undefined;
  vehicleId: string | null | undefined;
  onChange: (v: { driverId: string | null; vehicleId: string | null }) => void;
  layout?: 'vertical' | 'horizontal';
  allowClear?: boolean;
}

export function DriverVehiclePicker({
  carrierId,
  driverId,
  vehicleId,
  onChange,
  layout = 'vertical',
  allowClear = true,
}: Props) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [newDriverOpen, setNewDriverOpen] = useState(false);
  const [newVehicleOpen, setNewVehicleOpen] = useState(false);
  const [driverForm] = Form.useForm();
  const [vehicleForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => {
    if (!carrierId) {
      setDrivers([]);
      setVehicles([]);
      return;
    }
    carriersApi.listDrivers(carrierId).then(setDrivers).catch(() => setDrivers([]));
    carriersApi.listVehicles(carrierId).then(setVehicles).catch(() => setVehicles([]));
  }, [carrierId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const submitNewDriver = async () => {
    if (!carrierId) return;
    const values = (await driverForm.validateFields()) as {
      name: string;
      phone?: string;
      licenseNo?: string;
    };
    setCreating(true);
    try {
      const created = await carriersApi.addDriver(carrierId, values);
      setDrivers((prev) => [...prev, created]);
      onChange({ driverId: created.id, vehicleId: vehicleId ?? null });
      setNewDriverOpen(false);
      driverForm.resetFields();
      message.success(t('driverPicker.driverCreated'));
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('driverPicker.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const submitNewVehicle = async () => {
    if (!carrierId) return;
    const values = (await vehicleForm.validateFields()) as {
      plateNumber: string;
      towType?: string;
    };
    setCreating(true);
    try {
      const created = await carriersApi.addVehicle(carrierId, values);
      setVehicles((prev) => [...prev, created]);
      onChange({ driverId: driverId ?? null, vehicleId: created.id });
      setNewVehicleOpen(false);
      vehicleForm.resetFields();
      message.success(t('driverPicker.vehicleCreated'));
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('driverPicker.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const disabled = !carrierId;

  const items = (
    <>
      <Form.Item label={t('driverPicker.driver')}>
        <Space.Compact style={{ width: '100%' }}>
          <Select
            style={{ flex: 1 }}
            allowClear={allowClear}
            showSearch
            disabled={disabled}
            optionFilterProp="label"
            placeholder={
              disabled
                ? t('driverPicker.pickCarrierFirst')
                : t('driverPicker.driverPlaceholder')
            }
            value={driverId ?? undefined}
            onChange={(v) =>
              onChange({ driverId: v ?? null, vehicleId: vehicleId ?? null })
            }
            options={drivers.map((d) => ({
              value: d.id,
              label: `${d.name}${d.phone ? ` · ${d.phone}` : ''}`,
            }))}
          />
          <Button
            icon={<PlusOutlined />}
            disabled={disabled}
            onClick={() => setNewDriverOpen(true)}
          />
        </Space.Compact>
      </Form.Item>
      <Form.Item label={t('driverPicker.vehicle')}>
        <Space.Compact style={{ width: '100%' }}>
          <Select
            style={{ flex: 1 }}
            allowClear={allowClear}
            showSearch
            disabled={disabled}
            optionFilterProp="label"
            placeholder={
              disabled
                ? t('driverPicker.pickCarrierFirst')
                : t('driverPicker.vehiclePlaceholder')
            }
            value={vehicleId ?? undefined}
            onChange={(v) =>
              onChange({ driverId: driverId ?? null, vehicleId: v ?? null })
            }
            options={vehicles.map((v) => ({
              value: v.id,
              label: `${v.plateNumber}${v.towType ? ` · ${v.towType}` : ''}`,
            }))}
          />
          <Button
            icon={<PlusOutlined />}
            disabled={disabled}
            onClick={() => setNewVehicleOpen(true)}
          />
        </Space.Compact>
      </Form.Item>
    </>
  );

  return (
    <>
      {layout === 'horizontal' ? (
        <Space size="middle" style={{ width: '100%' }}>{items}</Space>
      ) : (
        items
      )}

      <Modal
        title={t('driverPicker.newDriverTitle')}
        open={newDriverOpen}
        onCancel={() => setNewDriverOpen(false)}
        onOk={submitNewDriver}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={driverForm} layout="vertical" preserve={false}>
          <Form.Item
            label={t('driverPicker.driverName')}
            name="name"
            rules={[{ required: true }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item label={t('driverPicker.driverPhone')} name="phone">
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item label={t('driverPicker.driverLicense')} name="licenseNo">
            <Input maxLength={40} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('driverPicker.newVehicleTitle')}
        open={newVehicleOpen}
        onCancel={() => setNewVehicleOpen(false)}
        onOk={submitNewVehicle}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={vehicleForm} layout="vertical" preserve={false}>
          <Form.Item
            label={t('driverPicker.plateNumber')}
            name="plateNumber"
            rules={[{ required: true }]}
          >
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item label={t('driverPicker.towType')} name="towType">
            <Select
              allowClear
              options={[
                { value: 'CC', label: 'CC' },
                { value: 'TOWING', label: 'TOWING' },
                { value: 'TANSYA', label: 'TANSYA' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
