'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  customersApi,
  CustomerAddress,
  CustomerAddressPayload,
} from '@/lib/api/customers';
import { parseDealerExcel } from '@/lib/customers/parse-dealer-excel';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  customerId: string | null;
  customerName?: string;
  onClose: () => void;
  onChanged?: () => void; // 有新增/删除/导入时通知父组件刷新
}

// 客户地址簿抽屉：门店表格 + Excel 批量导入 + 手动 CRUD
// 支持 BYD 门店 Excel 一键导入 (dealerGroup 合并单元格自动 forward-fill)
export function CustomerAddressBookDrawer({
  customerId,
  customerName,
  onClose,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    rows: CustomerAddressPayload[];
    mapped: string[];
    unmapped: string[];
    totalRead: number;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [form] = Form.useForm();

  const reload = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const c = await customersApi.get(customerId);
      setAddresses(c.addresses ?? []);
    } catch {
      message.error(t('customers.addressBook.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) reload();
    else setAddresses([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls,.csv',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (f) => {
      try {
        const result = await parseDealerExcel(f);
        if (result.rows.length === 0) {
          message.error(t('customers.addressBook.noRows'));
          return false;
        }
        setImportPreview({
          rows: result.rows,
          mapped: Object.entries(result.mappedColumns).map(
            ([field, header]) => `${field} ← ${header}`,
          ),
          unmapped: result.unmappedHeaders,
          totalRead: result.totalReadRows,
        });
        message.success(
          t('customers.addressBook.parsedSuccess', {
            n: result.rows.length,
            total: result.totalReadRows,
          }),
        );
      } catch (err) {
        message.error((err as Error).message);
      }
      return false;
    },
  };

  const confirmImport = async () => {
    if (!customerId || !importPreview) return;
    setImporting(true);
    try {
      const res = await customersApi.importAddresses(
        customerId,
        importPreview.rows,
      );
      message.success(
        t('customers.addressBook.importDone', {
          created: res.created,
          updated: res.updated,
          skipped: res.skipped,
        }),
      );
      setImportPreview(null);
      await reload();
      onChanged?.();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('customers.addressBook.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const openAddModal = () => {
    setEditing(null);
    form.resetFields();
    setAddOpen(true);
  };
  const openEditModal = (row: CustomerAddress) => {
    setEditing(row);
    form.setFieldsValue(row);
    setAddOpen(true);
  };

  const submitAddOrEdit = async (values: CustomerAddressPayload) => {
    if (!customerId) return;
    try {
      if (editing) {
        await customersApi.updateAddress(editing.id, values);
        message.success(t('customers.addressBook.updateSuccess'));
      } else {
        await customersApi.addAddress(customerId, values);
        message.success(t('customers.addressBook.addSuccess'));
      }
      setAddOpen(false);
      await reload();
      onChanged?.();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('customers.addressBook.saveFailed'));
    }
  };

  const onDelete = async (row: CustomerAddress) => {
    try {
      await customersApi.deleteAddress(row.id);
      message.success(t('customers.addressBook.deleteSuccess'));
      await reload();
      onChanged?.();
    } catch {
      message.error(t('customers.addressBook.deleteFailed'));
    }
  };

  return (
    <Drawer
      title={`${t('customers.addressBook.title')} · ${customerName ?? ''}`}
      open={!!customerId}
      onClose={onClose}
      width={880}
      destroyOnClose
    >
      <Space style={{ marginBottom: 12 }}>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />}>
            {t('customers.addressBook.import')}
          </Button>
        </Upload>
        <Button icon={<PlusOutlined />} onClick={openAddModal}>
          {t('customers.addressBook.add')}
        </Button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {t('customers.addressBook.total', { n: addresses.length })}
        </span>
      </Space>

      {importPreview && (
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message={t('customers.addressBook.previewTitle', {
            n: importPreview.rows.length,
            total: importPreview.totalRead,
          })}
          description={
            <div style={{ fontSize: 12 }}>
              <div>
                {t('customers.addressBook.mappedColumns')}:{' '}
                {importPreview.mapped.map((m) => (
                  <Tag key={m}>{m}</Tag>
                ))}
              </div>
              {importPreview.unmapped.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {t('customers.addressBook.ignoredColumns')}:{' '}
                  {importPreview.unmapped.map((h) => (
                    <Tag key={h} color="default">
                      {h}
                    </Tag>
                  ))}
                </div>
              )}
              <Space style={{ marginTop: 8 }}>
                <Button
                  type="primary"
                  loading={importing}
                  onClick={confirmImport}
                >
                  {t('customers.addressBook.confirmImport')}
                </Button>
                <Button onClick={() => setImportPreview(null)}>
                  {t('customers.addressBook.cancelImport')}
                </Button>
              </Space>
            </div>
          }
        />
      )}

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={addresses}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('customers.addressBook.emptyHint')}
            >
              <InboxOutlined style={{ fontSize: 24, color: '#94a3b8' }} />
            </Empty>
          ),
        }}
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: t('customers.addressBook.dealerGroup'),
            dataIndex: 'dealerGroup',
            render: (v) => v ?? '-',
          },
          {
            title: t('customers.addressBook.dealerName'),
            dataIndex: 'dealerName',
          },
          {
            title: t('customers.addressBook.address'),
            dataIndex: 'address',
            ellipsis: true,
          },
          {
            title: t('customers.addressBook.region'),
            dataIndex: 'region',
            render: (v) =>
              v ? <Tag color="blue">{v}</Tag> : '-',
          },
          {
            title: t('customers.addressBook.code'),
            dataIndex: 'code',
            render: (v) => v ?? '-',
          },
          {
            title: t('customers.addressBook.contactPhone'),
            dataIndex: 'contactPhone',
            render: (v) => v ?? '-',
          },
          {
            title: '',
            width: 100,
            render: (_, row: CustomerAddress) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEditModal(row)}
                />
                <Popconfirm
                  title={t('customers.addressBook.deleteConfirm')}
                  onConfirm={() => onDelete(row)}
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={
          editing
            ? t('customers.addressBook.editTitle')
            : t('customers.addressBook.addTitle')
        }
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submitAddOrEdit}>
          <Form.Item
            label={t('customers.addressBook.dealerGroup')}
            name="dealerGroup"
          >
            <Input placeholder="Arista" />
          </Form.Item>
          <Form.Item
            label={t('customers.addressBook.dealerName')}
            name="dealerName"
            rules={[{ required: true }]}
          >
            <Input placeholder="BYD ARISTA SUMMARECON BEKASI" />
          </Form.Item>
          <Form.Item
            label={t('customers.addressBook.address')}
            name="address"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label={t('customers.addressBook.region')} name="region">
            <Input placeholder="GREATER JAKARTA" />
          </Form.Item>
          <Form.Item label={t('customers.addressBook.code')} name="code">
            <Input placeholder="Z2410265332" />
          </Form.Item>
          <Form.Item
            label={t('customers.addressBook.contactName')}
            name="contactName"
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('customers.addressBook.contactPhone')}
            name="contactPhone"
          >
            <Input />
          </Form.Item>
          {editing && (
            <Form.Item
              label={t('customers.addressBook.isActive')}
              name="isActive"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Drawer>
  );
}
