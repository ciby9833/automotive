'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { carriersApi, Carrier } from '@/lib/api/carriers';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { GenerateInviteButton } from '@/components/invitations/GenerateInviteButton';
import { CarrierUsersPanel } from '@/components/carriers/CarrierUsersPanel';
import { Role } from '@/lib/auth/role';
import { OrgFilter } from '@/components/layout/OrgFilter';

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [usersDrawer, setUsersDrawer] = useState<Carrier | null>(null);
  const [form] = Form.useForm();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const role = useAuthStore((s) => s.user?.role);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  // 供应商员工不能新增供应商、也不能生成邀请码；只读自己的记录
  const canManage = role === Role.HQ_ADMIN || role === Role.ORG_ADMIN;

  const load = async () => {
    setLoading(true);
    try {
      setCarriers(await carriersApi.list(orgFilter));
    } catch {
      message.error(t('carriers.loadFailed'));
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
    type: string;
    contactName?: string;
    contactPhone?: string;
    email?: string;
  }) => {
    try {
      await carriersApi.create(values as never);
      message.success(t('carriers.createSuccess'));
      setOpen(false);
      form.resetFields();
      load();
    } catch {
      message.error(t('carriers.createFailed'));
    }
  };

  const columns = [
    {
      title: t('carriers.organization'),
      render: (_: unknown, record: Carrier) =>
        orgNameFromRecord(record, record.organizationId, organizations, locale),
    },
    { title: t('carriers.name'), dataIndex: 'name' },
    {
      title: t('carriers.type'),
      dataIndex: 'type',
      render: (v: string) => (
        <Tag color={v === 'SELF_OWNED' ? 'blue' : 'default'}>{t(`carrierType.${v}`)}</Tag>
      ),
    },
    { title: t('carriers.contactName'), dataIndex: 'contactName' },
    { title: t('carriers.contactPhone'), dataIndex: 'contactPhone' },
    { title: t('carriers.email'), dataIndex: 'email' },
  ];
  if (canManage) {
    columns.push({
      title: t('carriers.action'),
      render: (_: unknown, record: Carrier) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => setUsersDrawer(record)}
          >
            {t('carriers.viewUsers')}
          </Button>
          <GenerateInviteButton targetType="CARRIER" targetId={record.id} />
        </Space>
      ),
    } as never);
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('carriers.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        {canManage && (
          <Button type="primary" onClick={() => setOpen(true)}>
            {t('carriers.addCarrier')}
          </Button>
        )}
      </div>
      <Table rowKey="id" loading={loading} dataSource={carriers} columns={columns} />
      <Modal
        title={t('carriers.addCarrier')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onCreate}
          initialValues={{ type: 'EXTERNAL', organizationId: activeOrgId }}
        >
          <Form.Item label={t('carriers.organization')} name="organizationId" rules={[{ required: true }]}>
            <Select
              options={organizations.map((c) => ({
                value: c.id,
                label: localizedOrganizationName(c.code, c.name, locale),
              }))}
            />
          </Form.Item>
          <Form.Item label={t('carriers.name')} name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('carriers.type')} name="type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'EXTERNAL', label: t('carrierType.EXTERNAL') },
                { value: 'SELF_OWNED', label: t('carrierType.SELF_OWNED') },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('carriers.contactName')} name="contactName">
            <Input />
          </Form.Item>
          <Form.Item label={t('carriers.contactPhone')} name="contactPhone">
            <Input />
          </Form.Item>
          <Form.Item
            label={t('carriers.email')}
            name="email"
            rules={[{ type: 'email', message: t('carriers.emailInvalid') }]}
            extra={t('carriers.emailHint')}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={
          usersDrawer
            ? `${t('carriers.usersDrawerTitle')} · ${usersDrawer.name}`
            : t('carriers.usersDrawerTitle')
        }
        open={!!usersDrawer}
        onClose={() => setUsersDrawer(null)}
        width={960}
        destroyOnClose
      >
        {usersDrawer && (
          <CarrierUsersPanel
            carrierId={usersDrawer.id}
            carrierName={usersDrawer.name}
          />
        )}
      </Drawer>
    </div>
  );
}
