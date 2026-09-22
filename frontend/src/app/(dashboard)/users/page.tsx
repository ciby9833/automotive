"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import {
  usersApi,
  User,
  CreateUserPayload,
  UpdateUserPayload,
  UserMembership,
  MembershipGrant,
  AddMembershipPayload,
} from "@/lib/api/users";
import { Role } from "@/lib/auth/role";
import { useAuthStore } from "@/lib/auth/store";
import { useTranslation } from "@/i18n/useTranslation";
import { usePermission, Permission } from "@/lib/auth/permissions";
import { MembershipFields } from "@/components/users/MembershipFields";

function errorText(error: unknown, fallback: string) {
  const detail = (
    error as { response?: { data?: { message?: string | string[] } } }
  ).response?.data?.message;
  return Array.isArray(detail) ? detail.join("; ") : detail || fallback;
}

export default function UsersPage() {
  const { t } = useTranslation();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const current = useAuthStore((s) => s.user);
  const canManage = usePermission(Permission.SETUP_USER_CRUD);
  const canAssign = usePermission(Permission.SETUP_USER_MEMBERSHIP);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [membershipUser, setMembershipUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [editingMembership, setEditingMembership] =
    useState<UserMembership | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [addForm] = Form.useForm();
  const [grantForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await usersApi.list());
    } catch (e) {
      message.error(errorText(e, t("users.loadFailed")));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    setMembershipUser(null);
    setCreateOpen(false);
  }, [activeOrgId]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaults = {
    organizationId: activeOrgId,
    role: current?.role === Role.HQ_ADMIN ? Role.HQ_ADMIN : Role.ORG_ADMIN,
    roleIds: [],
  };

  const create = async (values: CreateUserPayload) => {
    setSaving(true);
    try {
      await usersApi.create({
        ...values,
        roleIds: canAssign ? (values.roleIds ?? []) : [],
        scopeYardId:
          values.role === Role.YARD_STAFF ? values.scopeYardId : undefined,
      });
      message.success(t("users.createSuccess"));
      setCreateOpen(false);
      await load();
    } catch (e) {
      message.error(errorText(e, t("users.createFailed")));
    } finally {
      setSaving(false);
    }
  };
  const edit = async (values: UpdateUserPayload) => {
    if (!editingUser) return;
    setSaving(true);
    try {
      await usersApi.update(editingUser.id, values);
      setEditingUser(null);
      await load();
    } catch (e) {
      message.error(errorText(e, t("users.updateFailed")));
    } finally {
      setSaving(false);
    }
  };
  const openMemberships = async (user: User) => {
    try {
      setMemberships(await usersApi.listMemberships(user.id));
      setMembershipUser(user);
      addForm.resetFields();
      addForm.setFieldsValue(defaults);
    } catch (e) {
      message.error(errorText(e, t("users.loadMembershipsFailed")));
    }
  };
  const refreshMemberships = async () => {
    if (membershipUser)
      setMemberships(await usersApi.listMemberships(membershipUser.id));
    await load();
  };
  const addMembership = async (values: AddMembershipPayload) => {
    if (!membershipUser) return;
    setSaving(true);
    try {
      await usersApi.addMembership(membershipUser.id, {
        ...values,
        roleIds: values.roleIds ?? [],
        scopeYardId:
          values.role === Role.YARD_STAFF ? values.scopeYardId : null,
      });
      await refreshMemberships();
      addForm.resetFields();
      addForm.setFieldsValue(defaults);
    } catch (e) {
      message.error(errorText(e, t("users.addMembershipFailed")));
    } finally {
      setSaving(false);
    }
  };
  const saveMembership = async (
    values: MembershipGrant & { organizationId: string },
  ) => {
    if (!membershipUser || !editingMembership) return;
    setSaving(true);
    try {
      await usersApi.updateMembership(membershipUser.id, editingMembership.id, {
        role: values.role,
        roleIds: values.roleIds ?? [],
        isActive: values.isActive,
        scopeYardId:
          values.role === Role.YARD_STAFF ? values.scopeYardId : null,
      });
      setEditingMembership(null);
      await refreshMemberships();
    } catch (e) {
      message.error(errorText(e, t("users.updateFailed")));
    } finally {
      setSaving(false);
    }
  };
  const removeMembership = async (id: string) => {
    if (!membershipUser) return;
    try {
      await usersApi.removeMembership(membershipUser.id, id);
      await refreshMemberships();
    } catch (e) {
      message.error(errorText(e, t("users.removeMembershipFailed")));
    }
  };
  const toggleUser = async (user: User) => {
    try {
      if (user.isActive) await usersApi.deactivate(user.id);
      else await usersApi.reactivate(user.id);
      await load();
    } catch (e) {
      message.error(errorText(e, t("users.updateFailed")));
    }
  };

  return (
    <div>
      <Space
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2>{t("users.title")}</h2>
        {canManage && (
          <Button
            type="primary"
            onClick={() => {
              createForm.resetFields();
              createForm.setFieldsValue(defaults);
              setCreateOpen(true);
            }}
          >
            {t("users.addUser")}
          </Button>
        )}
      </Space>
      <Alert
        type="info"
        showIcon
        title={t("access.userHint")}
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
        columns={[
          { title: t("users.username"), dataIndex: "username" },
          { title: t("users.displayName"), dataIndex: "displayName" },
          {
            title: t("users.organization"),
            render: (_, u: User) => (
              <>
                {u.memberships?.map((m) => (
                  <div key={m.id}>
                    {m.organization?.name} · {t("access.scope." + m.role)}{" "}
                    {!m.isActive && <Tag>{t("users.inactive")}</Tag>}
                  </div>
                ))}
              </>
            ),
          },
          {
            title: t("access.assignedRoles"),
            render: (_, u: User) => (
              <>
                {u.memberships?.map((m) => (
                  <div key={m.id}>
                    {m.accessRoles.length
                      ? m.accessRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                      : t("access.noRoles")}
                  </div>
                ))}
              </>
            ),
          },
          { title: t("users.email"), dataIndex: "email" },
          {
            title: t("common.status"),
            render: (_, u: User) => (
              <Tag color={u.isActive ? "green" : "default"}>
                {t(u.isActive ? "users.active" : "users.inactive")}
              </Tag>
            ),
          },
          {
            title: t("common.action"),
            render: (_, u: User) => (
              <Space>
                {canAssign && (
                  <Button size="small" onClick={() => void openMemberships(u)}>
                    {t("users.manageMemberships")}
                  </Button>
                )}
                {canManage && (
                  <>
                    <Button
                      size="small"
                      disabled={u.id === current?.id}
                      onClick={() => {
                        setEditingUser(u);
                        editForm.setFieldsValue({
                          displayName: u.displayName,
                          email: u.email,
                        });
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Popconfirm
                      title={t(
                        u.isActive
                          ? "access.disableConfirm"
                          : "access.enableConfirm",
                      )}
                      onConfirm={() => toggleUser(u)}
                    >
                      <Button
                        size="small"
                        disabled={u.id === current?.id}
                        danger={u.isActive}
                      >
                        {t(
                          u.isActive ? "users.deactivate" : "users.reactivate",
                        )}
                      </Button>
                    </Popconfirm>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        title={t("users.addUser")}
        width={620}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form name="create-user" form={createForm} layout="vertical" onFinish={create}>
          <Form.Item
            name="username"
            label={t("users.username")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("users.password")}
            rules={[{ required: true, min: 6 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="displayName"
            label={t("users.displayName")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input />
          </Form.Item>
          <MembershipFields form={createForm} canAssign={canAssign} />
          <Form.Item
            name="email"
            label={t("users.email")}
            rules={[{ type: "email" }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!editingUser}
        title={t("common.edit")}
        onCancel={() => setEditingUser(null)}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form name="edit-user" form={editForm} layout="vertical" onFinish={edit}>
          <Form.Item
            name="displayName"
            label={t("users.displayName")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label={t("users.email")}
            rules={[{ type: "email" }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!membershipUser}
        title={
          t("users.manageMemberships") +
          " · " +
          (membershipUser?.displayName ?? "")
        }
        width={900}
        onCancel={() => setMembershipUser(null)}
        footer={null}
        destroyOnHidden
      >
        <Table
          rowKey="id"
          dataSource={memberships}
          pagination={false}
          columns={[
            {
              title: t("users.organization"),
              render: (_, m: UserMembership) => m.organization?.name,
            },
            {
              title: t("access.accountScope"),
              render: (_, m: UserMembership) => t("access.scope." + m.role),
            },
            {
              title: t("access.assignedRoles"),
              render: (_, m: UserMembership) =>
                m.accessRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>),
            },
            {
              title: t("common.status"),
              render: (_, m: UserMembership) =>
                t(m.isActive ? "users.active" : "users.inactive"),
            },
            {
              title: t("common.action"),
              render: (_, m: UserMembership) => (
                <Space>
                  <Button
                    size="small"
                    disabled={membershipUser?.id === current?.id}
                    onClick={() => {
                      grantForm.resetFields();
                      grantForm.setFieldsValue({
                        ...m,
                        roleIds: m.accessRoles.map((r) => r.id),
                      });
                      setEditingMembership(m);
                    }}
                  >
                    {t("access.assignRoles")}
                  </Button>
                  <Popconfirm
                    title={t("users.removeMembershipConfirm")}
                    onConfirm={() => removeMembership(m.id)}
                  >
                    <Button
                      size="small"
                      danger
                      disabled={membershipUser?.id === current?.id}
                    >
                      {t("common.delete")}
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        {membershipUser?.id !== current?.id && (
          <Form
            name="add-membership"
            form={addForm}
            layout="vertical"
            onFinish={addMembership}
            style={{ marginTop: 20 }}
          >
            <h3>{t("users.addMembership")}</h3>
            <MembershipFields form={addForm} canAssign />
            <Button type="primary" htmlType="submit" loading={saving}>
              {t("users.addMembership")}
            </Button>
          </Form>
        )}
      </Modal>
      <Modal
        open={!!editingMembership}
        title={t("access.assignRoles")}
        width={620}
        onCancel={() => setEditingMembership(null)}
        onOk={() => grantForm.submit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form name="edit-membership"
          form={grantForm} layout="vertical" onFinish={saveMembership}>
          <MembershipFields form={grantForm} canAssign lockOrganization />
          <Form.Item
            name="isActive"
            label={t("common.status")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
