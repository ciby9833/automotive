"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Permission, usePermission } from '@/lib/auth/permissions';
import Link from "next/link";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Organization,
  OrganizationOperatingPolicy,
  organizationsApi,
} from "@/lib/api/organizations";
import { refreshOrganizations } from "@/lib/organization/useOrganizations";
import { Role } from "@/lib/auth/role";
import { useAuthStore } from "@/lib/auth/store";
import { useTranslation } from "@/i18n/useTranslation";

type OrgForm = Parameters<typeof organizationsApi.create>[0];
type PolicyForm = Parameters<typeof organizationsApi.updateOperatingPolicy>[1];
type TreeRow = Organization & { children?: TreeRow[] };
const currencies = ["IDR", "MYR", "THB", "VND", "PHP"].map((value) => ({
  value,
  label: value,
}));
const timezoneOptions = [
  "UTC",
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Manila",
].map((value) => ({ value }));

function errorMessage(error: unknown, fallback: string) {
  const detail = (
    error as { response?: { data?: { message?: string | string[] } } }
  ).response?.data?.message;
  return Array.isArray(detail) ? detail.join("；") : detail || fallback;
}

export default function OrganizationsPage() {
  const canManage = usePermission(Permission.ORG_CRUD);
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();
  const role = useAuthStore((s) => s.user?.role);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [rows, setRows] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<{
    type: "create" | "edit";
    org?: Organization;
  } | null>(null);
  const [policyOrg, setPolicyOrg] = useState<Organization | null>(null);
  const [created, setCreated] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusId, setStatusId] = useState<string>();
  const [form] = Form.useForm<OrgForm>();
  const [policyForm] = Form.useForm<PolicyForm>();
  const hq = rows.find((row) => row.parentId === null);

  const load = useCallback(async () => {
    try {
      setRows(await organizationsApi.management());
      setLoadError("");
    } catch (error) {
      setRows([]);
      setLoadError(errorMessage(error, t("orgManagement.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (role === Role.HQ_ADMIN) void load();
  }, [role, activeOrgId, load]);

  const tree = useMemo(() => {
    const map = new Map(rows.map((row) => [row.id, { ...row } as TreeRow]));
    const roots: TreeRow[] = [];
    for (const row of map.values()) {
      const parent = row.parentId && map.get(row.parentId);
      if (parent) (parent.children ??= []).push(row);
      else roots.push(row);
    }
    return roots;
  }, [rows]);

  const excludedParents = useMemo(() => {
    const excluded = new Set<string>();
    if (dialog?.type !== "edit" || !dialog.org) return excluded;
    excluded.add(dialog.org.id);
    for (let changed = true; changed;) {
      changed = false;
      for (const row of rows)
        if (
          row.parentId &&
          excluded.has(row.parentId) &&
          !excluded.has(row.id)
        ) {
          excluded.add(row.id);
          changed = true;
        }
    }
    return excluded;
  }, [dialog, rows]);

  const openCreate = (parent = hq) => {
    if (!parent) return;
    setDialog({ type: "create", org: parent });
  };

  const save = async (values: OrgForm) => {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.type === "create")
        setCreated(await organizationsApi.create(values));
      else if (dialog.org)
        await organizationsApi.update(dialog.org.id, {
          code: values.code,
          name: values.name,
          defaultCurrency: values.defaultCurrency,
          ...(dialog.org.parentId ? { parentId: values.parentId } : {}),
        });
      messageApi.success(t("orgManagement.saved"));
      setDialog(null);
      refreshOrganizations();
      await load();
    } catch (error) {
      messageApi.error(errorMessage(error, t("orgManagement.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async (values: PolicyForm) => {
    if (!policyOrg) return;
    setSaving(true);
    try {
      await organizationsApi.updateOperatingPolicy(policyOrg.id, values);
      messageApi.success(t("orgManagement.saved"));
      setPolicyOrg(null);
      refreshOrganizations();
      await load();
    } catch (error) {
      messageApi.error(errorMessage(error, t("orgManagement.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (org: Organization) => {
    setStatusId(org.id);
    try {
      await organizationsApi.setActive(org.id, !org.isActive);
      messageApi.success(t("orgManagement.saved"));
      refreshOrganizations();
      await load();
    } catch (error) {
      messageApi.error(errorMessage(error, t("orgManagement.saveFailed")));
    } finally {
      setStatusId(undefined);
    }
  };

  const calendarFields = (
    <>
      <Form.Item
        name="timezone"
        label={t("orgManagement.timezone")}
        rules={[
          { required: true },
          {
            validator: async (_, value) => {
              try {
                if (!value?.trim()) throw new Error();
                new Intl.DateTimeFormat("en", { timeZone: value }).format();
              } catch {
                throw new Error(t("orgManagement.invalidTimezone"));
              }
            },
          },
        ]}
      >
        <AutoComplete
          options={timezoneOptions}
          filterOption={(input, option) =>
            !!option?.value.toLowerCase().includes(input.toLowerCase())
          }
        />
      </Form.Item>
      <Form.Item
        name="businessDayCutoff"
        label={t("orgManagement.cutoff")}
        extra={t("orgManagement.cutoffHint")}
        rules={[
          { required: true },
          {
            pattern: /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
            message: t("orgManagement.invalidTime"),
          },
        ]}
      >
        <Input placeholder="02:00:00" />
      </Form.Item>
    </>
  );

  if (role !== Role.HQ_ADMIN)
    return <Result status="403" title={t("orgManagement.hqOnly")} />;
  return (
    <div>
      {contextHolder}
      <PageHeader
        title={t("orgManagement.title")}
        subtitle={t("orgManagement.subtitle")}
        actions={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              {t("common.refresh")}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canManage || !hq || !!loadError}
              onClick={() => openCreate()}
            >
              {t("orgManagement.create")}
            </Button>
          </Space>
        }
      />
      {loadError && (
        <Alert
          type="error"
          showIcon
          title={loadError}
          style={{ marginBottom: 16 }}
        />
      )}
      <Alert
        type="info"
        showIcon
        title={t("orgManagement.hierarchyHint")}
        style={{ marginBottom: 16 }}
      />
      {created && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setCreated(null)}
          style={{ marginBottom: 16 }}
          title={t("orgManagement.created", { name: created.name })}
          description={
            <>
              <p>{t("orgManagement.nextSteps")}</p>
              <Space wrap>
                <Link href="/users">{t("nav.users")}</Link>
                <Link href="/settings/yards">{t("nav.setupYards")}</Link>
                <Link href="/customers">{t("nav.customers")}</Link>
                <Link href="/carriers">{t("nav.carriers")}</Link>
              </Space>
            </>
          }
        />
      )}
      <Card>
        <Table<TreeRow>
          key={hq?.id ?? "loading"}
          rowKey="id"
          dataSource={tree}
          loading={loading}
          pagination={false}
          scroll={{ x: 1080 }}
          expandable={{ defaultExpandAllRows: true }}
          columns={[
            {
              title: t("orgManagement.name"),
              dataIndex: "name",
              width: 220,
              render: (name, row) => (
                <Space>
                  {name}
                  {!row.parentId && <Tag color="blue">HQ</Tag>}
                </Space>
              ),
            },
            { title: t("orgManagement.code"), dataIndex: "code", width: 110 },
            {
              title: t("orgManagement.currency"),
              dataIndex: "defaultCurrency",
              width: 90,
            },
            {
              title: t("orgManagement.calendar"),
              width: 210,
              render: (_, row) => (
                <>
                  {row.operatingPolicy?.timezone ?? "—"}
                  <br />
                  <Typography.Text type="secondary">
                    {row.operatingPolicy?.businessDayCutoff ?? "—"}
                  </Typography.Text>
                </>
              ),
            },
            {
              title: t("orgManagement.status"),
              width: 90,
              render: (_, row) => (
                <Tag color={row.isActive ? "green" : undefined}>
                  {t(
                    row.isActive
                      ? "orgManagement.active"
                      : "orgManagement.inactive",
                  )}
                </Tag>
              ),
            },
            {
              title: t("orgManagement.actions"),
              width: 400,
              render: (_, row) => (
                <Space wrap>
                  <Button
                    disabled={!canManage || !row.isActive}
                    size="small"
                    onClick={() => openCreate(row)}
                  >
                    {t("orgManagement.addChild")}
                  </Button>
                  <Button
                    size="small"
                    disabled={!canManage}
                    onClick={() => {
                      setDialog({ type: "edit", org: row });
                    }}
                  >
                    {t("orgManagement.edit")}
                  </Button>
                  <Button
                    size="small"
                    disabled={!canManage || !row.operatingPolicy}
                    onClick={() => {
                      setPolicyOrg(row);
                    }}
                  >
                    {t("orgManagement.policy")}
                  </Button>
                  {canManage && row.parentId && (
                    <Popconfirm
                      title={t(
                        row.isActive
                          ? "orgManagement.disableConfirm"
                          : "orgManagement.enableConfirm",
                      )}
                      description={
                        row.isActive
                          ? t("orgManagement.disableHint")
                          : undefined
                      }
                      onConfirm={() => setActive(row)}
                    >
                      <Button
                        size="small"
                        danger={row.isActive}
                        loading={statusId === row.id}
                      >
                        {t(
                          row.isActive
                            ? "orgManagement.disable"
                            : "orgManagement.enable",
                        )}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={t(
          dialog?.type === "create"
            ? "orgManagement.create"
            : "orgManagement.edit",
        )}
        open={!!dialog}
        width={560}
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => !saving && setDialog(null)}
        forceRender
        afterOpenChange={(open) => {
          if (!open || !dialog?.org) return;
          // Initialize after conditional fields are mounted in the modal.
          form.resetFields();
          const org = dialog.org;
          form.setFieldsValue(
            dialog.type === "create"
              ? {
                  parentId: org.id,
                  defaultCurrency: org.defaultCurrency,
                  timezone: org.operatingPolicy?.timezone ?? "Asia/Jakarta",
                  businessDayCutoff:
                    org.operatingPolicy?.businessDayCutoff ?? "02:00:00",
                }
              : { ...org, parentId: org.parentId ?? undefined },
          );
        }}
      >
        <Form form={form} layout="vertical" onFinish={save} preserve={false}>
          <Alert
            showIcon
            type="info"
            title={t(
              dialog?.type === "create"
                ? "orgManagement.createHint"
                : "orgManagement.editHint",
            )}
            style={{ marginBottom: 16 }}
          />
          {(dialog?.type === "create" || dialog?.org?.parentId) && (
            <Form.Item
              name="parentId"
              label={t("orgManagement.parent")}
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={rows
                  .filter((row) => row.isActive && !excludedParents.has(row.id))
                  .map((row) => ({
                    value: row.id,
                    label: `${row.name} (${row.code})`,
                  }))}
              />
            </Form.Item>
          )}
          <Form.Item
            name="code"
            label={t("orgManagement.code")}
            normalize={(value: string) => value.toUpperCase().trim()}
            rules={[
              { required: true },
              {
                pattern: /^[A-Z0-9][A-Z0-9_-]{0,31}$/,
                message: t("orgManagement.codeHint"),
              },
            ]}
          >
            <Input
              maxLength={32}
              disabled={dialog?.type === "edit" && !dialog.org?.parentId}
              placeholder="TEST"
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={t("orgManagement.name")}
            rules={[{ required: true, whitespace: true }, { max: 100 }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="defaultCurrency"
            label={t("orgManagement.currency")}
            rules={[{ required: true }]}
          >
            <Select
              options={currencies}
              disabled={dialog?.type === "edit" && !dialog.org?.parentId}
            />
          </Form.Item>
          {dialog?.type === "create" && calendarFields}
        </Form>
      </Modal>
      <Modal
        title={`${t("orgManagement.policy")} · ${policyOrg?.name ?? ""}`}
        open={!!policyOrg}
        width={560}
        confirmLoading={saving}
        onOk={() => policyForm.submit()}
        onCancel={() => !saving && setPolicyOrg(null)}
        forceRender
        afterOpenChange={(open) => {
          if (!open || !policyOrg?.operatingPolicy) return;
          const p = policyOrg.operatingPolicy;
          policyForm.resetFields();
          policyForm.setFieldsValue({
            timezone: p.timezone,
            businessDayCutoff: p.businessDayCutoff,
            snapshotEnabled: p.snapshotEnabled,
            longStayDays: p.longStayDays,
            lockTimeoutHours: p.lockTimeoutHours,
            expectedArrivalWarningHours: p.expectedArrivalWarningHours,
            utilizationWarningPercent: Number(p.utilizationWarningPercent),
            utilizationCriticalPercent: Number(p.utilizationCriticalPercent),
          });
        }}
      >
        <Form
          form={policyForm}
          layout="vertical"
          onFinish={savePolicy}
          preserve={false}
        >
          <Alert
            type="info"
            showIcon
            title={t("orgManagement.policyHint")}
            style={{ marginBottom: 16 }}
          />
          {calendarFields}
          <Form.Item
            name="snapshotEnabled"
            label={t("orgManagement.snapshot")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {(
            [
              ["longStayDays", 365],
              ["lockTimeoutHours", 8760],
              ["expectedArrivalWarningHours", 720],
              ["utilizationWarningPercent", 100],
              ["utilizationCriticalPercent", 100],
            ] as [keyof OrganizationOperatingPolicy, number][]
          ).map(([key, max]) => (
            <Form.Item
              key={key}
              name={key}
              label={t(`orgManagement.${key}`)}
              rules={[{ required: true, type: "number", min: 1, max }]}
            >
              <InputNumber
                min={1}
                max={max}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
}
