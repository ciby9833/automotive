"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import {
  rolesApi,
  AccessRole,
  CatalogMenu,
  RolePayload,
} from "@/lib/api/roles";
import { Role } from "@/lib/auth/role";
import { useAuthStore } from "@/lib/auth/store";
import { Permission, usePermission } from "@/lib/auth/permissions";
import { useOrganizations } from "@/lib/organization/useOrganizations";
import { useTranslation } from "@/i18n/useTranslation";
import styles from "./roles.module.css";

function errorText(error: unknown, fallback: string) {
  const detail = (
    error as { response?: { data?: { message?: string | string[] } } }
  ).response?.data?.message;
  return Array.isArray(detail) ? detail.join("; ") : detail || fallback;
}

export default function RolesPage() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  return (
    <RoleWorkspace
      key={activeOrgId}
      initialOrganizationId={activeOrgId ?? undefined}
    />
  );
}

function RoleWorkspace({
  initialOrganizationId,
}: {
  initialOrganizationId?: string;
}) {
  const { t } = useTranslation();
  const organizations = useOrganizations();
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [dirty, setDirty] = useState(false);
  const [modal, contextHolder] = Modal.useModal();
  const confirmLeave = (action: () => void) => {
    if (!dirty) return action();
    modal.confirm({
      title: t("access.discardTitle"),
      content: t("access.discardHint"),
      okText: t("access.discard"),
      cancelText: t("common.cancel"),
      onOk: () => {
        setDirty(false);
        action();
      },
    });
  };
  const organization = organizations.find((o) => o.id === organizationId);
  return (
    <div>
      {contextHolder}
      <div className={styles.pageHeader}>
        <div>
          <h2>{t("access.rolesTitle")}</h2>
          <div className={styles.muted}>{t("access.workspaceHint")}</div>
        </div>
        <div>
          <span className={styles.organizationLabel}>
            {t("access.targetOrganization")}
          </span>
          <Select
            aria-label={t("access.targetOrganization")}
            className={styles.organizationSelect}
            value={organizationId}
            options={organizations.map((o) => ({
              value: o.id,
              label: `${o.name} (${o.code})`,
            }))}
            onChange={(id) => confirmLeave(() => setOrganizationId(id))}
          />
        </div>
      </div>
      {organization && (
        <OrganizationRoles
          key={organization.id}
          organizationId={organization.id}
          root={organization.parentId === null}
          onDirty={setDirty}
          confirmLeave={confirmLeave}
        />
      )}
    </div>
  );
}

function OrganizationRoles({
  organizationId,
  root,
  onDirty,
  confirmLeave,
}: {
  organizationId: string;
  root: boolean;
  onDirty: (dirty: boolean) => void;
  confirmLeave: (action: () => void) => void;
}) {
  const { t } = useTranslation();
  const canManage = usePermission(Permission.SETUP_ROLE_MANAGE);
  const [rows, setRows] = useState<AccessRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    rolesApi
      .list(organizationId)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setSelectedId((id) =>
          data.some((r) => r.id === id) ? id : (data[0]?.id ?? null),
        );
        setFailed(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setFailed(true);
          message.error(errorText(e, t("access.loadFailed")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, version, t]);
  const select = (id: string | null) =>
    confirmLeave(() => {
      setCreating(id === null);
      setSelectedId(id);
      setEditorVersion((n) => n + 1);
      onDirty(false);
    });
  const refresh = () =>
    confirmLeave(() => {
      setLoading(true);
      setCreating(false);
      setEditorVersion((n) => n + 1);
      onDirty(false);
      setVersion((n) => n + 1);
    });
  const selectedRole = rows.find((r) => r.id === selectedId);
  const visible = rows.filter((r) =>
    r.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const saved = (role: AccessRole) => {
    // Reload server-derived self-assignment/editability metadata after saving.
    setSelectedId(role.id);
    setCreating(false);
    onDirty(false);
    setLoading(true);
    setRows((current) =>
      current.some((r) => r.id === role.id)
        ? current.map((r) => (r.id === role.id ? role : r))
        : [...current, role],
    );
    setEditorVersion((n) => n + 1);
    setVersion((n) => n + 1);
  };
  return (
    <div className={styles.workspace}>
      <Card
        className={styles.rolePanel}
        title={
          <span>
            {t("access.roleList")}{" "}
            <span className={styles.muted}>({rows.length})</span>
          </span>
        }
        extra={
          <Button
            type="text"
            aria-label={t("access.reload")}
            icon={<ReloadOutlined />}
            onClick={refresh}
            disabled={loading}
          />
        }
      >
        <Input.Search
          aria-label={t("access.searchRoles")}
          placeholder={t("access.searchRoles")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        {canManage && (
          <Button
            block
            icon={<PlusOutlined />}
            onClick={() => select(null)}
            className={styles.createButton}
            disabled={loading}
          >
            {t("access.createRole")}
          </Button>
        )}
        <Spin spinning={loading}>
          <div
            className={styles.roleList}
            role="group"
            aria-label={t("access.roleList")}
          >
            {visible.map((role) => (
              <button
                key={role.id}
                type="button"
                aria-pressed={!creating && selectedId === role.id}
                className={`${styles.roleItem} ${!creating && selectedId === role.id ? styles.selected : ""}`}
                onClick={() => select(role.id)}
              >
                <div className={styles.roleName}>
                  <strong>{role.name}</strong>
                  <Tag color={role.isActive ? "green" : "default"}>
                    {t(role.isActive ? "users.active" : "users.inactive")}
                  </Tag>
                </div>
                <div className={styles.muted}>
                  {t(`access.scope.${role.type}`)}
                </div>
                <div className={styles.muted}>
                  {t("access.memberCount", { n: role.assignedCount ?? 0 })}
                </div>
              </button>
            ))}
            {!loading && !visible.length && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t(
                  failed ? "access.loadFailed" : "access.emptyRoles",
                )}
              />
            )}
          </div>
        </Spin>
      </Card>
      <Card className={styles.editorPanel}>
        {loading ? (
          <div className={styles.emptyEditor}>
            <Spin />
          </div>
        ) : creating || selectedRole ? (
          <RoleEditor
            key={`${selectedRole?.id ?? "new"}:${editorVersion}`}
            role={creating ? null : selectedRole!}
            organizationId={organizationId}
            root={root}
            onDirty={onDirty}
            onSaved={saved}
          />
        ) : (
          <Empty
            className={styles.emptyEditor}
            description={t("access.selectRoleHint")}
          />
        )}
      </Card>
    </div>
  );
}

function RoleEditor({
  role,
  organizationId,
  root,
  onDirty,
  onSaved,
}: {
  role: AccessRole | null;
  organizationId: string;
  root: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (role: AccessRole) => void;
}) {
  const { t } = useTranslation();
  const allowedToManage = usePermission(Permission.SETUP_ROLE_MANAGE);
  const canManage = allowedToManage && role?.canManage !== false;
  const canChangePermissions = canManage && !role?.isAssignedToSelf;
  const [form] = Form.useForm();
  const type: Role =
    Form.useWatch("type", form) ??
    role?.type ??
    (root ? Role.HQ_ADMIN : Role.ORG_ADMIN);
  const selected: string[] =
    Form.useWatch("permissions", form) ?? role?.permissions ?? [];
  const [catalog, setCatalog] = useState<CatalogMenu[]>([]);
  const [catalogType, setCatalogType] = useState<Role | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const changeDirty = (value: boolean) => {
    setDirty(value);
    onDirty(value);
  };
  const catalogReady = catalogType === type && catalog.length > 0;
  useEffect(() => {
    let cancelled = false;
    rolesApi
      .catalog(organizationId, type)
      .then((menus) => {
        if (!cancelled) {
          setCatalog(menus);
          setCatalogType(type);
          setCatalogFailed(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setCatalogFailed(true);
          message.error(errorText(e, t("access.loadFailed")));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, type, retry, t]);
  const setPermissions = (permissions: Set<string>) => {
    form.setFieldValue("permissions", [...permissions]);
    changeDirty(true);
  };
  const toggleMenu = (menu: CatalogMenu, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(menu.permission);
    else {
      next.delete(menu.permission);
      for (const action of menu.actions)
        if (
          !catalog.some(
            (other) =>
              other.permission !== menu.permission &&
              next.has(other.permission) &&
              other.actions.some((a) => a.code === action.code),
          )
        )
          next.delete(action.code);
    }
    setPermissions(next);
  };
  const toggleAction = (menu: CatalogMenu, code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(menu.permission);
      next.add(code);
    } else next.delete(code);
    setPermissions(next);
  };
  const save = async (values: RolePayload & { isActive: boolean }) => {
    if (!canManage || !catalogReady || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        description: values.description,
        permissions: values.permissions ?? [],
      };
      const result = role
        ? await rolesApi.update(role.id, {
            ...payload,
            isActive: values.isActive,
          })
        : await rolesApi.create({
            ...payload,
            organizationId,
            type: values.type,
          });
      message.success(t("common.updated"));
      changeDirty(false);
      onSaved({ ...role, ...result, assignedCount: role?.assignedCount ?? 0 });
    } catch (e) {
      message.error(errorText(e, t("access.saveFailed")));
    } finally {
      setSaving(false);
    }
  };
  const groups = new Map<string, { label: string; menus: CatalogMenu[] }>();
  for (const menu of catalogReady ? catalog : []) {
    if (!groups.has(menu.group)) {
      const key = `nav.group.${menu.group}`;
      const label = t(key);
      groups.set(menu.group, {
        label: label === key ? menu.groupLabel : label,
        menus: [],
      });
    }
    groups.get(menu.group)!.menus.push(menu);
  }
  return (
    <Form
      name="access-role"
      form={form}
      layout="vertical"
      disabled={!canManage || saving}
      initialValues={
        role ?? {
          type: root ? Role.HQ_ADMIN : Role.ORG_ADMIN,
          permissions: [],
          isActive: true,
        }
      }
      onValuesChange={() => changeDirty(true)}
      onFinish={save}
    >
      <div className={styles.editorHeader}>
        <div>
          <h3>{role?.name ?? t("access.createRole")}</h3>
          <span className={styles.muted}>{t("access.roleDetail")}</span>
        </div>
        {canManage && (
          <Space>
            <Button
              disabled={!dirty || saving}
              onClick={() => {
                form.resetFields();
                changeDirty(false);
              }}
            >
              {t("access.reset")}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!dirty || !catalogReady || catalogFailed}
            >
              {t("access.save")}
            </Button>
          </Space>
        )}
      </div>
      {role?.isAssignedToSelf && (
        <Alert
          type="info"
          showIcon
          title={t("access.selfRoleHint")}
          className={styles.notice}
        />
      )}
      {!canManage && (
        <Alert
          type="info"
          showIcon
          title={t("access.readOnlyHint")}
          className={styles.notice}
        />
      )}
      <div className={styles.baseFields}>
        <Form.Item
          name="name"
          label={t("access.roleName")}
          rules={[{ required: true, whitespace: true, max: 80 }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="type"
          label={t("access.accountScope")}
          rules={[{ required: true }]}
        >
          <Select
            disabled={!!role || !canManage || saving}
            options={(root
              ? [Role.HQ_ADMIN]
              : [Role.ORG_ADMIN, Role.YARD_STAFF]
            ).map((r) => ({ value: r, label: t(`access.scope.${r}`) }))}
            onChange={() => {
              form.setFieldValue("permissions", []);
              changeDirty(true);
              setCatalogFailed(false);
            }}
          />
        </Form.Item>
        {role && (
          <Form.Item
            name="isActive"
            valuePropName="checked"
            label={t("common.status")}
          >
            <Switch
              disabled={
                !canChangePermissions || (role.assignedCount ?? 0) > 0 || saving
              }
            />
          </Form.Item>
        )}
      </div>
      <Form.Item name="description" label={t("access.description")}>
        <Input maxLength={500} />
      </Form.Item>
      {role && (
        <div className={styles.muted}>
          {t("access.affectsMembers", { n: role.assignedCount ?? 0 })}
        </div>
      )}
      <Form.Item name="permissions" hidden>
        <Select mode="multiple" />
      </Form.Item>
      <div className={styles.permissionTitle}>
        <h3>{t("access.modulePermissions")}</h3>
        <Tag>
          {t("access.selectedMenus", {
            n: selected.filter((p) => p.startsWith("menu:")).length,
          })}
        </Tag>
      </div>
      <div className={styles.muted}>{t("access.menuActionHint")}</div>
      {catalogFailed ? (
        <Alert
          type="error"
          title={t("access.loadFailed")}
          action={
            <Button
              onClick={() => {
                setCatalogFailed(false);
                setRetry((n) => n + 1);
              }}
            >
              {t("access.reload")}
            </Button>
          }
        />
      ) : !catalogReady ? (
        <div className={styles.emptyEditor}>
          <Spin />
        </div>
      ) : (
        <Tabs
          className={styles.moduleTabs}
          items={[...groups].map(([key, group]) => ({
            key,
            label: (
              <span>
                {group.label}{" "}
                <span className={styles.muted}>
                  {
                    group.menus.filter((m) => selected.includes(m.permission))
                      .length
                  }
                  /{group.menus.length}
                </span>
              </span>
            ),
            children: (
              <div className={styles.moduleRows}>
                {group.menus.map((menu) => (
                  <div key={menu.key} className={styles.menuRow}>
                    <div className={styles.menuAccess}>
                      <Checkbox
                        checked={selected.includes(menu.permission)}
                        disabled={
                          !canChangePermissions || !menu.selectable || saving
                        }
                        onChange={(e) => toggleMenu(menu, e.target.checked)}
                      >
                        {t(menu.i18nKey) === menu.i18nKey
                          ? menu.label
                          : t(menu.i18nKey)}
                      </Checkbox>
                      <div className={styles.muted}>{t("access.viewMenu")}</div>
                    </div>
                    <div className={styles.actions}>
                      {menu.actions.length ? (
                        menu.actions.map((a) => (
                          <Checkbox
                            key={a.code}
                            checked={selected.includes(a.code)}
                            disabled={
                              !canChangePermissions ||
                              !menu.selectable ||
                              !a.selectable ||
                              saving
                            }
                            onChange={(e) =>
                              toggleAction(menu, a.code, e.target.checked)
                            }
                          >
                            {t(`permissionLabels.${a.code}`)}
                          </Checkbox>
                        ))
                      ) : (
                        <span className={styles.muted}>
                          {t("access.queryOnly")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ),
          }))}
        />
      )}
    </Form>
  );
}
