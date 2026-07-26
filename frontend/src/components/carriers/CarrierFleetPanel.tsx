'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { carriersApi, type Driver, type Vehicle } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  carrierId: string;
  carrierName?: string;
}

// 承运商司机 / 车辆花名册管理
// - HQ/ORG 侧从供应商列表打开
// - 承运商自家从菜单打开
// Tab 切换：司机 · 车辆
export function CarrierFleetPanel({ carrierId, carrierName }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'drivers' | 'vehicles'>('drivers');

  return (
    <Tabs
      activeKey={tab}
      onChange={(k) => setTab(k as 'drivers' | 'vehicles')}
      items={[
        {
          key: 'drivers',
          label: t('carrierFleet.tabDrivers'),
          children: (
            <DriversTab carrierId={carrierId} carrierName={carrierName} />
          ),
        },
        {
          key: 'vehicles',
          label: t('carrierFleet.tabVehicles'),
          children: (
            <VehiclesTab carrierId={carrierId} carrierName={carrierName} />
          ),
        },
      ]}
    />
  );
}

function DriversTab({ carrierId, carrierName }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<
    'ALL' | 'ACTIVE' | 'DISABLED'
  >('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    carriersApi
      .listDrivers(carrierId, true)
      .then((all) => {
        if (stateFilter === 'ACTIVE') return all.filter((d) => d.isActive);
        if (stateFilter === 'DISABLED') return all.filter((d) => !d.isActive);
        return all;
      })
      .then(setRows)
      .catch(() => message.error(t('carrierFleet.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId, stateFilter]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setCreateOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditing(d);
    form.setFieldsValue({
      name: d.name,
      phone: d.phone ?? '',
      licenseNo: d.licenseNo ?? '',
      bankName: d.bankName ?? '',
      bankAccountName: d.bankAccountName ?? '',
      bankAccountNo: d.bankAccountNo ?? '',
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    const values = (await form.validateFields()) as {
      name: string;
      phone?: string;
      licenseNo?: string;
      bankName?: string;
      bankAccountName?: string;
      bankAccountNo?: string;
    };
    try {
      if (editing) {
        await carriersApi.updateDriver(carrierId, editing.id, {
          name: values.name,
          phone: values.phone?.trim() || null,
          licenseNo: values.licenseNo?.trim() || null,
          bankName: values.bankName?.trim() || null,
          bankAccountName: values.bankAccountName?.trim() || null,
          bankAccountNo: values.bankAccountNo?.trim() || null,
        });
        message.success(t('carrierFleet.driverUpdated'));
      } else {
        await carriersApi.addDriver(carrierId, values);
        message.success(t('carrierFleet.driverCreated'));
      }
      setCreateOpen(false);
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierFleet.saveFailed'));
    }
  };

  const doToggle = async (d: Driver) => {
    try {
      if (d.isActive) {
        await carriersApi.deactivateDriver(carrierId, d.id);
        message.success(t('carrierFleet.driverDisabled'));
      } else {
        await carriersApi.reactivateDriver(carrierId, d.id);
        message.success(t('carrierFleet.driverEnabled'));
      }
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierFleet.saveFailed'));
    }
  };

  const doDelete = async (d: Driver) => {
    try {
      await carriersApi.deleteDriver(carrierId, d.id);
      message.success(t('carrierFleet.driverDeleted'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierFleet.deleteFailed'));
    }
  };

  return (
    <div>
      <Space
        style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}
        wrap
      >
        <Space>
          <Segmented
            value={stateFilter}
            onChange={(v) =>
              setStateFilter(v as 'ALL' | 'ACTIVE' | 'DISABLED')
            }
            options={[
              { label: t('carrierFleet.stateAll'), value: 'ALL' },
              { label: t('carrierFleet.stateActive'), value: 'ACTIVE' },
              { label: t('carrierFleet.stateDisabled'), value: 'DISABLED' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('carrierFleet.addDriver')}
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description={t('carrierFleet.emptyDrivers')} /> }}
        columns={[
          { title: t('carrierFleet.driverName'), dataIndex: 'name' },
          {
            title: t('carrierFleet.phone'),
            dataIndex: 'phone',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('carrierFleet.licenseNo'),
            dataIndex: 'licenseNo',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('carrierFleet.bank'),
            render: (_: unknown, d: Driver) => {
              const parts = [d.bankName, d.bankAccountNo].filter(Boolean);
              return parts.length > 0 ? parts.join(' · ') : '-';
            },
          },
          {
            title: t('carrierFleet.state'),
            dataIndex: 'isActive',
            width: 90,
            render: (v: boolean) =>
              v ? (
                <Tag color="green">{t('carrierFleet.stateActive')}</Tag>
              ) : (
                <Tag color="red">{t('carrierFleet.stateDisabled')}</Tag>
              ),
          },
          {
            title: '',
            width: 240,
            render: (_: unknown, d: Driver) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(d)}
                >
                  {t('carrierFleet.edit')}
                </Button>
                {d.isActive ? (
                  <Popconfirm
                    title={t('carrierFleet.disableConfirm')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => doToggle(d)}
                  >
                    <Button type="link" size="small" danger>
                      {t('carrierFleet.disable')}
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    icon={<UnlockOutlined />}
                    onClick={() => doToggle(d)}
                  >
                    {t('carrierFleet.enable')}
                  </Button>
                )}
                <Popconfirm
                  title={t('carrierFleet.deleteConfirm', { name: d.name })}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => doDelete(d)}
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  >
                    {t('carrierFleet.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={
          editing
            ? t('carrierFleet.editDriver')
            : carrierName
              ? `${t('carrierFleet.addDriver')} · ${carrierName}`
              : t('carrierFleet.addDriver')
        }
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submit}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label={t('carrierFleet.driverName')}
            name="name"
            rules={[{ required: true }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item label={t('carrierFleet.phone')} name="phone">
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item label={t('carrierFleet.licenseNo')} name="licenseNo">
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item label={t('carrierFleet.bankName')} name="bankName">
            <Input maxLength={60} placeholder={t('carrierFleet.bankNameHint')} />
          </Form.Item>
          <Form.Item
            label={t('carrierFleet.bankAccountName')}
            name="bankAccountName"
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            label={t('carrierFleet.bankAccountNo')}
            name="bankAccountNo"
          >
            <Input maxLength={60} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function VehiclesTab({ carrierId, carrierName }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<
    'ALL' | 'ACTIVE' | 'DISABLED'
  >('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    carriersApi
      .listVehicles(carrierId, true)
      .then((all) => {
        if (stateFilter === 'ACTIVE') return all.filter((v) => v.isActive);
        if (stateFilter === 'DISABLED') return all.filter((v) => !v.isActive);
        return all;
      })
      .then(setRows)
      .catch(() => message.error(t('carrierFleet.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId, stateFilter]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setCreateOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    form.setFieldsValue({
      plateNumber: v.plateNumber,
      towType: v.towType,
    });
    setCreateOpen(true);
  };

  const submit = async () => {
    const values = (await form.validateFields()) as {
      plateNumber: string;
      towType?: string;
    };
    try {
      if (editing) {
        await carriersApi.updateVehicle(carrierId, editing.id, {
          plateNumber: values.plateNumber,
          towType: values.towType ?? null,
        });
        message.success(t('carrierFleet.vehicleUpdated'));
      } else {
        await carriersApi.addVehicle(carrierId, {
          plateNumber: values.plateNumber,
          towType: values.towType,
        });
        message.success(t('carrierFleet.vehicleCreated'));
      }
      setCreateOpen(false);
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierFleet.saveFailed'));
    }
  };

  const doToggle = async (v: Vehicle) => {
    try {
      if (v.isActive) {
        await carriersApi.deactivateVehicle(carrierId, v.id);
        message.success(t('carrierFleet.vehicleDisabled'));
      } else {
        await carriersApi.reactivateVehicle(carrierId, v.id);
        message.success(t('carrierFleet.vehicleEnabled'));
      }
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierFleet.saveFailed'));
    }
  };

  const doDelete = async (v: Vehicle) => {
    try {
      await carriersApi.deleteVehicle(carrierId, v.id);
      message.success(t('carrierFleet.vehicleDeleted'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierFleet.deleteFailed'));
    }
  };

  return (
    <div>
      <Space
        style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}
        wrap
      >
        <Space>
          <Segmented
            value={stateFilter}
            onChange={(v) =>
              setStateFilter(v as 'ALL' | 'ACTIVE' | 'DISABLED')
            }
            options={[
              { label: t('carrierFleet.stateAll'), value: 'ALL' },
              { label: t('carrierFleet.stateActive'), value: 'ACTIVE' },
              { label: t('carrierFleet.stateDisabled'), value: 'DISABLED' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('carrierFleet.addVehicle')}
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description={t('carrierFleet.emptyVehicles')} /> }}
        columns={[
          { title: t('carrierFleet.plateNumber'), dataIndex: 'plateNumber' },
          {
            title: t('carrierFleet.towType'),
            dataIndex: 'towType',
            render: (v: string | null) =>
              v ? <Tag color="blue">{v}</Tag> : '-',
          },
          {
            title: t('carrierFleet.state'),
            dataIndex: 'isActive',
            width: 90,
            render: (v: boolean) =>
              v ? (
                <Tag color="green">{t('carrierFleet.stateActive')}</Tag>
              ) : (
                <Tag color="red">{t('carrierFleet.stateDisabled')}</Tag>
              ),
          },
          {
            title: '',
            width: 240,
            render: (_: unknown, v: Vehicle) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(v)}
                >
                  {t('carrierFleet.edit')}
                </Button>
                {v.isActive ? (
                  <Popconfirm
                    title={t('carrierFleet.disableConfirm')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => doToggle(v)}
                  >
                    <Button type="link" size="small" danger>
                      {t('carrierFleet.disable')}
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    icon={<UnlockOutlined />}
                    onClick={() => doToggle(v)}
                  >
                    {t('carrierFleet.enable')}
                  </Button>
                )}
                <Popconfirm
                  title={t('carrierFleet.deleteConfirm', { name: v.plateNumber })}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => doDelete(v)}
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  >
                    {t('carrierFleet.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={
          editing
            ? t('carrierFleet.editVehicle')
            : carrierName
              ? `${t('carrierFleet.addVehicle')} · ${carrierName}`
              : t('carrierFleet.addVehicle')
        }
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submit}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label={t('carrierFleet.plateNumber')}
            name="plateNumber"
            rules={[{ required: true }]}
          >
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item label={t('carrierFleet.towType')} name="towType">
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
    </div>
  );
}
