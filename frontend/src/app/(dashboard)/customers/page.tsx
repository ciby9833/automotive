'use client';

import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import { EditOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { PartnerStatus } from '@/lib/api/carriers';
import { customersApi, Customer } from '@/lib/api/customers';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { Role } from '@/lib/auth/role';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { GenerateInviteButton } from '@/components/invitations/GenerateInviteButton';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { CustomerAddressBookDrawer } from '@/components/customers/CustomerAddressBookDrawer';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [showInactive, setShowInactive] = useState(false);
  const [addressBookCustomer, setAddressBookCustomer] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = role === Role.HQ_ADMIN || role === Role.ORG_ADMIN;
  const canEdit = canCreate;
  const { t, locale } = useTranslation();

  const load = async () => {
    setLoading(true);
    try {
      setCustomers(await customersApi.list(orgFilter));
    } catch {
      message.error(t('customers.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgFilter]);

  const onCreate = async (values: {
    organizationId: string;
    name: string;
    contactName?: string;
    contactPhone?: string;
    email?: string;
  }) => {
    try {
      await customersApi.create(values);
      message.success(t('customers.createSuccess'));
      setOpen(false);
      form.resetFields();
      load();
    } catch {
      message.error(t('customers.createFailed'));
    }
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    editForm.setFieldsValue({
      name: c.name,
      contactName: c.contactName,
      contactPhone: c.contactPhone,
      email: c.email,
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    const values = await editForm.validateFields();
    try {
      await customersApi.update(editing.id, {
        name: values.name,
        contactName: values.contactName || null,
        contactPhone: values.contactPhone || null,
        email: values.email || null,
      });
      message.success(t('common.updated'));
      setEditing(null);
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(detail || t('customers.updateFailed'));
    }
  };

  const changeStatus = async (customer: Customer, status: PartnerStatus) => {
    try {
      await customersApi.setStatus(customer.id, status);
      message.success(t('partners.statusUpdated'));
      load();
    } catch (err) {
      const data = (err as {
        response?: { data?: { code?: string; message?: string; details?: { inflightCount?: number } } };
      }).response?.data;
      if (data?.code === 'PARTNER_HAS_INFLIGHT_BUSINESS') {
        Modal.confirm({
          title: t('partners.pauseSuggestedTitle'),
          content: data.message,
          okText: t('partners.pauseInstead'),
          onOk: async () => {
            await customersApi.setStatus(customer.id, 'PAUSED');
            message.success(t('partners.pausedWithInflight', {
              n: data.details?.inflightCount ?? 0,
            }));
            load();
          },
        });
        return;
      }
      message.error(data?.message || t('customers.deactivateFailed'));
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('customers.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
          <Space size={4}>
            <Switch size="small" checked={showInactive} onChange={setShowInactive} />
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {t('customers.showInactive')}
            </span>
          </Space>
        </Space>
        {canCreate && (
          <Button type="primary" onClick={() => setOpen(true)}>
            {t('customers.addCustomer')}
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={showInactive ? customers : customers.filter((c) => c.status !== 'INACTIVE')}
        columns={[
          {
            title: t('customers.organization'),
            render: (_: unknown, record: Customer) =>
              orgNameFromRecord(record, record.organizationId, organizations, locale),
          },
          {
            title: t('customers.name'),
            render: (_: unknown, r: Customer) => (
              <Space>
                <span>{r.name}</span>
                <Tag color={r.status === 'ACTIVE' ? 'green' : r.status === 'PAUSED' ? 'orange' : 'default'}>
                  {t(`partners.status.${r.status}`)}
                </Tag>
              </Space>
            ),
          },
          { title: t('customers.contactName'), dataIndex: 'contactName' },
          { title: t('customers.contactPhone'), dataIndex: 'contactPhone' },
          { title: t('customers.email'), dataIndex: 'email' },
          {
            title: t('customers.addressBookColumn'),
            render: (_: unknown, record: Customer) => (
              <Button
                type="link"
                size="small"
                icon={<EnvironmentOutlined />}
                onClick={() => setAddressBookCustomer(record)}
              >
                {t('customers.addressBookOpen')}
              </Button>
            ),
          },
          ...(canEdit
            ? [
                {
                  title: t('customers.action'),
                  render: (_: unknown, record: Customer) => (
                    <Space size="small">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEdit(record)}
                      />
                      <Select<PartnerStatus>
                        size="small"
                        value={record.status}
                        style={{ width: 110 }}
                        onChange={(status) => changeStatus(record, status)}
                        options={(['ACTIVE', 'PAUSED', 'INACTIVE'] as PartnerStatus[]).map((status) => ({
                          value: status,
                          label: t(`partners.status.${status}`),
                        }))}
                      />
                      <GenerateInviteButton
                        targetType="CUSTOMER"
                        targetId={record.id}
                      />
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <CustomerAddressBookDrawer
        customerId={addressBookCustomer?.id ?? null}
        customerName={addressBookCustomer?.name}
        onClose={() => setAddressBookCustomer(null)}
      />
      <Modal
        title={t('customers.editTitle')}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label={t('customers.name')} name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('customers.contactName')} name="contactName">
            <Input />
          </Form.Item>
          <Form.Item label={t('customers.contactPhone')} name="contactPhone">
            <Input />
          </Form.Item>
          <Form.Item
            label={t('customers.email')}
            name="email"
            rules={[{ type: 'email', message: t('customers.emailInvalid') }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('customers.addCustomer')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} initialValues={{ organizationId: activeOrgId }}>
          <Form.Item label={t('customers.organization')} name="organizationId" rules={[{ required: true }]}>
            <Select
              options={organizations.map((c) => ({
                value: c.id,
                label: localizedOrganizationName(c.code, c.name, locale),
              }))}
            />
          </Form.Item>
          <Form.Item label={t('customers.name')} name="name" rules={[{ required: true }]}>
            <Input placeholder={t('customers.namePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('customers.contactName')} name="contactName">
            <Input />
          </Form.Item>
          <Form.Item label={t('customers.contactPhone')} name="contactPhone">
            <Input />
          </Form.Item>
          <Form.Item
            label={t('customers.email')}
            name="email"
            rules={[{ type: 'email', message: t('customers.emailInvalid') }]}
            extra={t('customers.emailHint')}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
