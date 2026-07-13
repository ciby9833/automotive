'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import {
  usersApi,
  User,
  CreateUserPayload,
  UpdateUserPayload,
  UserMembership,
} from '@/lib/api/users';
import { yardsApi, Yard } from '@/lib/api/yards';
import { Role } from '@/lib/auth/role';
import { useAuthStore } from '@/lib/auth/store';
import { useOrganizations } from '@/lib/organization/useOrganizations';
import { useTranslation } from '@/i18n/useTranslation';
import { localizedOrganizationName } from '@/i18n/organizationNames';

// 只允许内部三种角色由此界面创建/管理；外部角色(承运商员工/司机/客户)由 Carrier/Customer 详情页
// 生成邀请码后凭码注册产生，不出现在 users 列表里
const INTERNAL_ROLES: Role[] = [Role.HQ_ADMIN, Role.ORG_ADMIN, Role.YARD_STAFF];
// 机构管理员可创建同级 ORG_ADMIN + 下级 YARD_STAFF；不能创建 HQ_ADMIN 防止提权
const ORG_ADMIN_MANAGEABLE_ROLES: Role[] = [Role.ORG_ADMIN, Role.YARD_STAFF];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [membershipUser, setMembershipUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [addMembershipForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  // Ant Form 里 shouldUpdate 用 watch 更简单：跟踪 role 字段决定是否显示场地绑定
  const watchedCreateRole = Form.useWatch('role', createForm);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const organizations = useOrganizations();
  const currentRole = useAuthStore((s) => s.user?.role);
  const { t, locale } = useTranslation();

  const assignableRoles =
    currentRole === Role.HQ_ADMIN ? INTERNAL_ROLES : ORG_ADMIN_MANAGEABLE_ROLES;

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await usersApi.list());
    } catch {
      message.error(t('users.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // yard 列表用于场地绑定下拉；scope 内的 yard 都可选
    yardsApi.list().then(setYards).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const onCreate = async (values: CreateUserPayload) => {
    try {
      // 非 YARD_STAFF 时清空 scopeYardId 避免误绑
      if (values.role !== Role.YARD_STAFF) values.scopeYardId = undefined;
      await usersApi.create(values);
      message.success(t('users.createSuccess'));
      setCreateOpen(false);
      createForm.resetFields();
      load();
    } catch {
      message.error(t('users.createFailed'));
    }
  };

  const onEdit = async (values: UpdateUserPayload) => {
    if (!editingUser) return;
    try {
      // 只有 YARD_STAFF 才允许 scopeYardId
      if (editingUser.role !== Role.YARD_STAFF) values.scopeYardId = null;
      await usersApi.update(editingUser.id, values);
      message.success(t('users.updateSuccess'));
      setEditingUser(null);
      load();
    } catch {
      message.error(t('users.updateFailed'));
    }
  };

  const openMemberships = async (user: User) => {
    setMembershipUser(user);
    setMembershipsLoading(true);
    try {
      const list = await usersApi.listMemberships(user.id);
      setMemberships(list);
    } catch {
      message.error(t('users.loadMembershipsFailed'));
    } finally {
      setMembershipsLoading(false);
    }
  };

  const onAddMembership = async (values: { organizationId: string; role: Role }) => {
    if (!membershipUser) return;
    try {
      await usersApi.addMembership(membershipUser.id, values);
      const list = await usersApi.listMemberships(membershipUser.id);
      setMemberships(list);
      addMembershipForm.resetFields();
      load();
    } catch {
      message.error(t('users.addMembershipFailed'));
    }
  };

  const onRemoveMembership = async (membershipId: string) => {
    if (!membershipUser) return;
    try {
      await usersApi.removeMembership(membershipUser.id, membershipId);
      const list = await usersApi.listMemberships(membershipUser.id);
      setMemberships(list);
      load();
    } catch {
      message.error(t('users.removeMembershipFailed'));
    }
  };

  const orgNameById = (id: string) => {
    const c = organizations.find((c) => c.id === id);
    return c ? localizedOrganizationName(c.code, c.name, locale) : id;
  };

  const yardNameById = (id: string | null) => {
    if (!id) return '-';
    const y = yards.find((y) => y.id === id);
    return y ? `${y.name} (${y.code})` : id;
  };

  const yardOptions = yards.map((y) => ({
    value: y.id,
    label: `${y.name} · ${y.code} · ${orgNameById(y.organizationId)}`,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>{t('users.title')}</h2>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          {t('users.addUser')}
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
        columns={[
          { title: t('users.username'), dataIndex: 'username' },
          { title: t('users.displayName'), dataIndex: 'displayName' },
          {
            title: t('users.role'),
            dataIndex: 'role',
            render: (v: Role) => <Tag>{t(`roles.${v}`)}</Tag>,
          },
          {
            title: t('users.memberships'),
            render: (_: unknown, record: User) => (
              <Space size={4} wrap>
                {(record.memberships ?? []).map((m) => (
                  <Tag key={m.id} color="blue">
                    {orgNameById(m.organizationId)} · {t(`roles.${m.role}`)}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            title: t('users.scopeYard'),
            dataIndex: 'scopeYardId',
            render: (v: string | null, record: User) =>
              record.role === Role.YARD_STAFF ? yardNameById(v) : '-',
          },
          { title: t('users.email'), dataIndex: 'email' },
          {
            title: t('users.status'),
            dataIndex: 'isActive',
            render: (v: boolean) =>
              v ? <Tag color="green">{t('users.active')}</Tag> : <Tag>{t('users.inactive')}</Tag>,
          },
          {
            title: t('users.action'),
            render: (_: unknown, record: User) => (
              <Space.Compact>
                <Button size="small" onClick={() => openMemberships(record)}>
                  {t('users.manageMemberships')}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setEditingUser(record);
                    editForm.setFieldsValue(record);
                  }}
                >
                  {t('users.edit')}
                </Button>
                {record.isActive ? (
                  <Button
                    size="small"
                    danger
                    onClick={async () => {
                      await usersApi.deactivate(record.id);
                      load();
                    }}
                  >
                    {t('users.deactivate')}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    onClick={async () => {
                      await usersApi.reactivate(record.id);
                      load();
                    }}
                  >
                    {t('users.reactivate')}
                  </Button>
                )}
              </Space.Compact>
            ),
          },
        ]}
      />

      <Modal
        title={t('users.addUser')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={onCreate}
          initialValues={{ organizationId: activeOrgId }}
        >
          <Form.Item label={t('users.username')} name="username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('users.password')} name="password" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label={t('users.displayName')} name="displayName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('users.role')} name="role" rules={[{ required: true }]}>
            <Select options={assignableRoles.map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
          </Form.Item>
          <Form.Item
            label={t('users.organization')}
            name="organizationId"
            rules={[{ required: true }]}
          >
            <Select
              options={organizations.map((c) => ({
                value: c.id,
                label: localizedOrganizationName(c.code, c.name, locale),
              }))}
            />
          </Form.Item>
          {watchedCreateRole === Role.YARD_STAFF && (
            <Form.Item
              label={t('users.scopeYard')}
              name="scopeYardId"
              extra={t('users.scopeYardHint')}
              rules={[{ required: true, message: t('users.scopeYardRequired') }]}
            >
              <Select
                showSearch
                placeholder={t('users.scopeYardPlaceholder')}
                optionFilterProp="label"
                options={yardOptions}
              />
            </Form.Item>
          )}
          <Form.Item label={t('users.email')} name="email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('users.editUser')}
        open={!!editingUser}
        onCancel={() => setEditingUser(null)}
        onOk={() => editForm.submit()}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={onEdit}>
          <Form.Item label={t('users.displayName')} name="displayName">
            <Input />
          </Form.Item>
          {editingUser?.role === Role.YARD_STAFF && (
            <Form.Item
              label={t('users.scopeYard')}
              name="scopeYardId"
              extra={t('users.scopeYardHint')}
            >
              <Select
                showSearch
                allowClear
                placeholder={t('users.scopeYardPlaceholder')}
                optionFilterProp="label"
                options={yardOptions}
              />
            </Form.Item>
          )}
          <Form.Item label={t('users.email')} name="email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('users.status')} name="isActive" valuePropName="checked">
            <Switch checkedChildren={t('users.active')} unCheckedChildren={t('users.inactive')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${t('users.manageMemberships')} · ${membershipUser?.displayName ?? ''}`}
        open={!!membershipUser}
        onCancel={() => setMembershipUser(null)}
        onOk={() => setMembershipUser(null)}
        width={640}
        destroyOnHidden
      >
        <Table
          size="small"
          rowKey="id"
          loading={membershipsLoading}
          dataSource={memberships}
          pagination={false}
          columns={[
            {
              title: t('users.organization'),
              dataIndex: 'organizationId',
              render: (id: string) => orgNameById(id),
            },
            {
              title: t('users.role'),
              dataIndex: 'role',
              render: (v: Role) => <Tag>{t(`roles.${v}`)}</Tag>,
            },
            {
              title: t('users.action'),
              render: (_: unknown, record: UserMembership) => (
                <Popconfirm
                  title={t('users.removeMembershipConfirm')}
                  onConfirm={() => onRemoveMembership(record.id)}
                >
                  <Button size="small" danger>
                    {t('users.removeMembership')}
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 16 }}>
          <h4>{t('users.addMembership')}</h4>
          <Form form={addMembershipForm} layout="inline" onFinish={onAddMembership}>
            <Form.Item name="organizationId" rules={[{ required: true }]}>
              <Select
                style={{ width: 200 }}
                placeholder={t('users.organization')}
                options={organizations.map((c) => ({
                  value: c.id,
                  label: localizedOrganizationName(c.code, c.name, locale),
                }))}
              />
            </Form.Item>
            <Form.Item name="role" rules={[{ required: true }]}>
              <Select
                style={{ width: 160 }}
                placeholder={t('users.role')}
                options={assignableRoles.map((r) => ({
                  value: r,
                  label: t(`roles.${r}`),
                }))}
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                {t('users.addMembership')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
