'use client';

import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Table, message } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
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
  const [addressBookCustomer, setAddressBookCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = role === Role.HQ_ADMIN || role === Role.ORG_ADMIN;
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('customers.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
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
        dataSource={customers}
        columns={[
          {
            title: t('customers.organization'),
            render: (_: unknown, record: Customer) =>
              orgNameFromRecord(record, record.organizationId, organizations, locale),
          },
          { title: t('customers.name'), dataIndex: 'name' },
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
          ...(canCreate
            ? [
                {
                  title: t('customers.action'),
                  render: (_: unknown, record: Customer) => (
                    <GenerateInviteButton
                      targetType="CUSTOMER"
                      targetId={record.id}
                    />
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
