'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
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
  Tag,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { carriersApi, type CarrierUser } from '@/lib/api/carriers';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  carrierId: string;
  carrierName?: string;
  // HQ/ORG 侧展示是否允许创建 CARRIER_STAFF；承运商自家默认 true
  allowRoles?: Array<'CARRIER_STAFF' | 'CARRIER_DRIVER'>;
}

// 承运商账号管理面板
// - HQ/ORG 侧从"承运商列表 → 账号"打开
// - 承运商自家从"账号管理"菜单打开（carrierId 从当前 session 取）
// 两处 UI 完全一致，仅调用方传不同 carrierId
export function CarrierUsersPanel({ carrierId, carrierName, allowRoles }: Props) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<CarrierUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'ALL' | 'CARRIER_STAFF' | 'CARRIER_DRIVER'
  >('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>(
    'ALL',
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editing, setEditing] = useState<CarrierUser | null>(null);
  const [editForm] = Form.useForm();

  // 重置密码后一次性显示
  const [resetResult, setResetResult] = useState<{
    username: string;
    temporaryPassword: string;
  } | null>(null);

  const load = () => {
    setLoading(true);
    carriersApi
      .listUsers(carrierId, {
        keyword: keyword.trim() || undefined,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        active:
          activeFilter === 'ALL' ? undefined : activeFilter === 'ACTIVE',
      })
      .then(setUsers)
      .catch(() => message.error(t('carrierUsers.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierId, roleFilter, activeFilter]);

  const submitCreate = async () => {
    const values = (await createForm.validateFields()) as {
      username: string;
      password: string;
      displayName: string;
      role: 'CARRIER_STAFF' | 'CARRIER_DRIVER';
      email?: string;
    };
    setCreateSubmitting(true);
    try {
      await carriersApi.createUser(carrierId, values);
      message.success(t('carrierUsers.createOk'));
      setCreateOpen(false);
      createForm.resetFields();
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierUsers.createFailed'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEdit = (u: CarrierUser) => {
    setEditing(u);
    editForm.setFieldsValue({
      displayName: u.displayName,
      email: u.email ?? '',
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    const values = (await editForm.validateFields()) as {
      displayName?: string;
      email?: string;
    };
    try {
      await carriersApi.updateUser(carrierId, editing.id, {
        displayName: values.displayName,
        email: values.email?.trim() || null,
      });
      message.success(t('carrierUsers.updateOk'));
      setEditing(null);
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierUsers.updateFailed'));
    }
  };

  const doDeactivate = async (u: CarrierUser) => {
    try {
      await carriersApi.deactivateUser(carrierId, u.id);
      message.success(t('carrierUsers.deactivateOk'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierUsers.deactivateFailed'));
    }
  };

  const doReactivate = async (u: CarrierUser) => {
    try {
      await carriersApi.reactivateUser(carrierId, u.id);
      message.success(t('carrierUsers.reactivateOk'));
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierUsers.reactivateFailed'));
    }
  };

  const doResetPassword = async (u: CarrierUser) => {
    try {
      const res = await carriersApi.resetUserPassword(carrierId, u.id);
      setResetResult(res);
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      message.error(detail || t('carrierUsers.resetFailed'));
    }
  };

  const roleOptions = (allowRoles ?? ['CARRIER_STAFF', 'CARRIER_DRIVER']).map(
    (r) => ({ value: r, label: t(`role.${r}`) }),
  );

  return (
    <div>
      <Space
        style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}
        wrap
      >
        <Space wrap>
          <Segmented
            value={roleFilter}
            onChange={(v) =>
              setRoleFilter(v as 'ALL' | 'CARRIER_STAFF' | 'CARRIER_DRIVER')
            }
            options={[
              { label: t('carrierUsers.roleAll'), value: 'ALL' },
              { label: t('role.CARRIER_STAFF'), value: 'CARRIER_STAFF' },
              { label: t('role.CARRIER_DRIVER'), value: 'CARRIER_DRIVER' },
            ]}
          />
          <Segmented
            value={activeFilter}
            onChange={(v) =>
              setActiveFilter(v as 'ALL' | 'ACTIVE' | 'DISABLED')
            }
            options={[
              { label: t('carrierUsers.stateAll'), value: 'ALL' },
              { label: t('carrierUsers.stateActive'), value: 'ACTIVE' },
              { label: t('carrierUsers.stateDisabled'), value: 'DISABLED' },
            ]}
          />
          <Input.Search
            style={{ width: 240 }}
            placeholder={t('carrierUsers.searchPlaceholder')}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={load}
          />
          <Button icon={<ReloadOutlined />} onClick={load} />
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          {t('carrierUsers.addUser')}
        </Button>
      </Space>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={users}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description={t('carrierUsers.empty')} /> }}
        columns={[
          {
            title: t('carrierUsers.username'),
            dataIndex: 'username',
          },
          {
            title: t('carrierUsers.displayName'),
            dataIndex: 'displayName',
          },
          {
            title: t('carrierUsers.role'),
            dataIndex: 'role',
            width: 120,
            render: (r: string) => (
              <Tag color={r === 'CARRIER_STAFF' ? 'blue' : 'default'}>
                {t(`role.${r}`)}
              </Tag>
            ),
          },
          {
            title: t('carrierUsers.email'),
            dataIndex: 'email',
            render: (v: string | null) => v ?? '-',
          },
          {
            title: t('carrierUsers.state'),
            dataIndex: 'isActive',
            width: 90,
            render: (v: boolean) =>
              v ? (
                <Tag color="green">{t('carrierUsers.stateActive')}</Tag>
              ) : (
                <Tag color="red">{t('carrierUsers.stateDisabled')}</Tag>
              ),
          },
          {
            title: '',
            width: 260,
            render: (_: unknown, u: CarrierUser) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(u)}
                >
                  {t('carrierUsers.edit')}
                </Button>
                <Popconfirm
                  title={t('carrierUsers.resetConfirm', { username: u.username })}
                  onConfirm={() => doResetPassword(u)}
                >
                  <Button type="link" size="small" icon={<KeyOutlined />}>
                    {t('carrierUsers.resetPwd')}
                  </Button>
                </Popconfirm>
                {u.isActive ? (
                  <Popconfirm
                    title={t('carrierUsers.deactivateConfirm', {
                      username: u.username,
                    })}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => doDeactivate(u)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    >
                      {t('carrierUsers.deactivate')}
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    icon={<UnlockOutlined />}
                    onClick={() => doReactivate(u)}
                  >
                    {t('carrierUsers.reactivate')}
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={
          carrierName
            ? `${t('carrierUsers.addUser')} · ${carrierName}`
            : t('carrierUsers.addUser')
        }
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={submitCreate}
        confirmLoading={createSubmitting}
        destroyOnClose
      >
        <Alert
          type="info"
          message={t('carrierUsers.createHint')}
          style={{ marginBottom: 12 }}
        />
        <Form
          form={createForm}
          layout="vertical"
          preserve={false}
          initialValues={{ role: 'CARRIER_DRIVER' }}
        >
          <Form.Item
            label={t('carrierUsers.username')}
            name="username"
            rules={[{ required: true, min: 3, max: 60 }]}
          >
            <Input maxLength={60} placeholder="e.g. kmdi_driver_02" />
          </Form.Item>
          <Form.Item
            label={t('carrierUsers.password')}
            name="password"
            rules={[{ required: true, min: 6, max: 60 }]}
          >
            <Input.Password maxLength={60} />
          </Form.Item>
          <Form.Item
            label={t('carrierUsers.displayName')}
            name="displayName"
            rules={[{ required: true }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            label={t('carrierUsers.role')}
            name="role"
            rules={[{ required: true }]}
          >
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item
            label={t('carrierUsers.email')}
            name="email"
            rules={[
              { type: 'email', message: t('carrierUsers.emailInvalid') },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('carrierUsers.editTitle')}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item label={t('carrierUsers.displayName')} name="displayName">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            label={t('carrierUsers.email')}
            name="email"
            rules={[
              { type: 'email', message: t('carrierUsers.emailInvalid') },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('carrierUsers.resetOkTitle')}
        open={!!resetResult}
        onCancel={() => setResetResult(null)}
        onOk={() => setResetResult(null)}
        okText={t('carrierUsers.resetOkClose')}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {resetResult && (
          <>
            <Alert
              type="warning"
              message={t('carrierUsers.resetOkHint')}
              style={{ marginBottom: 12 }}
            />
            <p style={{ margin: 0 }}>
              <strong>{t('carrierUsers.username')}</strong>: {resetResult.username}
            </p>
            <p style={{ margin: '8px 0 0 0' }}>
              <strong>{t('carrierUsers.newPassword')}</strong>:{' '}
              <code
                style={{
                  fontSize: 18,
                  padding: '4px 8px',
                  background: '#f1f5f9',
                  borderRadius: 4,
                }}
              >
                {resetResult.temporaryPassword}
              </code>
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
