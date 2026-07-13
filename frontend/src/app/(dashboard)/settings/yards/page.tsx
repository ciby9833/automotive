'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { yardsApi, Yard } from '@/lib/api/yards';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';
import { orgNameFromRecord } from '@/lib/organization/nameFrom';
import { OrgFilter } from '@/components/layout/OrgFilter';
import { Permission, usePermission } from '@/lib/auth/permissions';

// 场地配置(Setup) - 一年维护几次的基础数据
// 只做场地本身的 CRUD；库位配置在 /settings/slots；日常可视化在 /yards
export default function YardSetupPage() {
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const { t, locale } = useTranslation();

  const canManage = usePermission(Permission.SETUP_YARD_CRUD);

  const load = async () => {
    setLoading(true);
    try {
      setYards(await yardsApi.list(orgFilter));
    } catch {
      message.error(t('yards.loadFailed'));
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
    code: string;
    name: string;
    address?: string;
  }) => {
    try {
      await yardsApi.create(values);
      message.success(t('yards.createSuccess'));
      setOpen(false);
      form.resetFields();
      load();
    } catch {
      message.error(t('yards.createFailed'));
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <h2 style={{ margin: 0 }}>{t('setupYards.title')}</h2>
          <OrgFilter value={orgFilter} onChange={setOrgFilter} />
        </Space>
        {canManage && (
          <Button type="primary" onClick={() => setOpen(true)}>
            {t('setupYards.addYard')}
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={yards}
        columns={[
          {
            title: t('yards.organization'),
            render: (_: unknown, r: Yard) =>
              orgNameFromRecord(r, r.organizationId, organizations, locale),
          },
          { title: t('yards.code'), dataIndex: 'code' },
          { title: t('yards.name'), dataIndex: 'name' },
          { title: t('yards.address'), dataIndex: 'address' },
          {
            title: t('yards.status'),
            dataIndex: 'isActive',
            render: (v: boolean) =>
              v ? <Tag color="green">{t('yards.active')}</Tag> : <Tag>{t('yards.inactive')}</Tag>,
          },
        ]}
      />
      <Modal
        title={t('setupYards.addYard')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onCreate}
          initialValues={{ organizationId: activeOrgId }}
        >
          <Form.Item label={t('yards.organization')} name="organizationId" rules={[{ required: true }]}>
            <Select
              options={organizations.map((c) => ({
                value: c.id,
                label: localizedOrganizationName(c.code, c.name, locale),
              }))}
            />
          </Form.Item>
          <Form.Item label={t('yards.code')} name="code" rules={[{ required: true }]}>
            <Input placeholder={t('yards.codePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('yards.name')} name="name" rules={[{ required: true }]}>
            <Input placeholder={t('yards.namePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('yards.address')} name="address">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
