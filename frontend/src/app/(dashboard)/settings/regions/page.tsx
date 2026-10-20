"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Radio, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { clearRegionCache } from "@/components/regions/RegionSelect";
import { useTranslation } from "@/i18n/useTranslation";
import { Permission, usePermission } from "@/lib/auth/permissions";
import { regionsApi, type ManagedRegion } from "@/lib/api/regions";

type Row = ManagedRegion & { children?: Row[] };

const COUNTRY_LABEL: Record<string, string> = {
  ID: "Indonesia",
  MY: "Malaysia",
  TH: "Thailand",
  VN: "Việt Nam",
  PH: "Philippines",
};

function errorText(e: unknown, fallback: string) {
  const x = e as { response?: { data?: { message?: string | string[] } } };
  const m = x.response?.data?.message;
  return (Array.isArray(m) ? m.join("; ") : m) || fallback;
}

/**
 * 行政区划维护：各国标准区划（省/州 → 县/市）可以按实际情况新增、改名、删除；
 * 自定义区域（如 GREATER JAKARTA 这类业务片区）可以独立存在，也可以挂在某个一级区域下。被门店或报价用着的不能删。
 */
export default function RegionsPage() {
  const { t } = useTranslation();
  const canManage = usePermission(Permission.REGION_MANAGE);
  const [messageApi, contextHolder] = message.useMessage();
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState<string>();
  const [rows, setRows] = useState<ManagedRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManagedRegion | "new" | null>(null);

  useEffect(() => {
    regionsApi
      .manageCountries()
      .then((list) => {
        setCountries(list);
        setCountry((c) => c ?? list[0]);
      })
      .catch((e) => messageApi.error(errorText(e, t("regions.loadFailed"))));
  }, [messageApi, t]);

  const load = useCallback(async () => {
    if (!country) return;
    setLoading(true);
    try {
      setRows(await regionsApi.manageList(country));
    } catch (e) {
      messageApi.error(errorText(e, t("regions.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [country, messageApi, t]);
  useEffect(() => {
    void load();
  }, [load]);

  // 两级树；搜索时保留命中项及其上级
  const tree = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hit = (r: ManagedRegion) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    const kids = new Map<string, Row[]>();
    for (const r of rows) if (r.parent_id) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r]);
    return rows
      .filter((r) => !r.parent_id)
      .map((r): Row => {
        const children = (kids.get(r.id) ?? []).filter((c) => hit(c) || hit(r));
        return { ...r, children: children.length ? children : undefined };
      })
      .filter((r) => hit(r) || r.children?.length);
  }, [rows, search]);
  const roots = useMemo(() => rows.filter((r) => !r.parent_id), [rows]);

  const typeLabel = (type: string) => {
    const key = `regions.types.${type}`;
    const text = t(key);
    return text === key ? type : text;
  };

  const remove = async (r: ManagedRegion) => {
    try {
      await regionsApi.remove(r.id);
      clearRegionCache();
      messageApi.success(t("regions.deleted"));
      void load();
    } catch (e) {
      messageApi.error(errorText(e, t("regions.saveFailed")));
    }
  };

  return (
    <div>
      {contextHolder}
      <PageHeader
        title={t("regions.title")}
        subtitle={t("regions.subtitle")}
        actions={
          <Space>
            {countries.length > 1 && (
              <Select
                style={{ width: 170 }}
                value={country}
                onChange={(v) => {
                  setSearch("");
                  setCountry(v);
                }}
                options={countries.map((c) => ({ value: c, label: `${c} · ${COUNTRY_LABEL[c] ?? c}` }))}
              />
            )}
            <Button type="primary" icon={<PlusOutlined />} disabled={!canManage || !country} onClick={() => setEditing("new")}>
              {t("regions.add")}
            </Button>
          </Space>
        }
      />
      <Input.Search
        allowClear
        placeholder={t("regions.search")}
        style={{ width: 280, marginBottom: 12 }}
        onSearch={setSearch}
        onChange={(e) => !e.target.value && setSearch("")}
      />
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={tree}
        expandable={search ? { expandedRowKeys: tree.map((r) => r.id) } : undefined}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          {
            title: t("regions.name"),
            render: (_, r) => (
              <Space size={6}>
                {r.name}
                {r.type === "CUSTOM" && <Tag color="purple">{t("regions.customTag")}</Tag>}
                {r.type !== "CUSTOM" && !r.is_system && <Tag>{t("regions.manualTag")}</Tag>}
              </Space>
            ),
          },
          { title: t("regions.code"), dataIndex: "code", width: 200 },
          { title: t("regions.type"), dataIndex: "type", width: 140, render: (v: string) => typeLabel(v) },
          {
            title: t("regions.usage"),
            width: 200,
            render: (_, r) =>
              r.address_count || r.tariff_count ? (
                <Typography.Text type="secondary">
                  {t("regions.usageText", { addresses: r.address_count, tariffs: r.tariff_count })}
                </Typography.Text>
              ) : null,
          },
          {
            title: "",
            width: 140,
            render: (_, r) => {
              const blocked = r.child_count + r.address_count + r.tariff_count > 0;
              return (
                <Space size={0}>
                  <Button type="link" size="small" disabled={!canManage} onClick={() => setEditing(r)}>
                    {t("common.edit")}
                  </Button>
                  <Tooltip title={blocked ? t("regions.inUse") : undefined}>
                    <Popconfirm
                      title={t("regions.deleteConfirm", { name: r.name })}
                      disabled={!canManage || blocked}
                      onConfirm={() => void remove(r)}
                    >
                      <Button type="link" size="small" danger disabled={!canManage || blocked}>
                        {t("common.delete")}
                      </Button>
                    </Popconfirm>
                  </Tooltip>
                </Space>
              );
            },
          },
        ]}
      />
      {editing && country && (
        <RegionModal
          country={country}
          region={editing === "new" ? null : editing}
          roots={roots}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            clearRegionCache();
            messageApi.success(t("regions.saved"));
            void load();
          }}
        />
      )}
    </div>
  );
}

function RegionModal({
  country,
  region,
  roots,
  onClose,
  onSaved,
}: {
  country: string;
  region: ManagedRegion | null;
  roots: ManagedRegion[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // 标准区划的代码和层级来自官方数据，只能改名
  const fixed = !!region?.is_system;
  return (
    <Modal
      open
      title={region ? t("regions.edit") : t("regions.add")}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        const v = (await form.validateFields()) as { name: string; code?: string; parentId?: string; custom: boolean };
        setBusy(true);
        setError(undefined);
        try {
          if (region)
            await regionsApi.update(region.id, {
              name: v.name,
              ...(fixed ? {} : { code: v.code || undefined, parentId: v.parentId ?? null }),
            });
          else await regionsApi.create({ country, name: v.name, code: v.code || undefined, parentId: v.parentId, custom: v.custom });
          onSaved();
        } catch (e) {
          setError(errorText(e, t("regions.saveFailed")));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          region
            ? { name: region.name, code: region.code, parentId: region.parent_id ?? undefined }
            : { custom: false }
        }
      >
        {!region && (
          <Form.Item name="custom" label={t("regions.kind")}>
            <Radio.Group
              optionType="button"
              options={[
                { value: false, label: t("regions.kindOfficial") },
                { value: true, label: t("regions.kindCustom") },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item name="name" label={t("regions.name")} rules={[{ required: true, whitespace: true }]}>
          <Input maxLength={150} />
        </Form.Item>
        <Form.Item name="parentId" label={t("regions.parent")} extra={t("regions.parentHint")}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            disabled={fixed || (!!region && region.child_count > 0)}
            options={roots.filter((r) => r.id !== region?.id).map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item name="code" label={t("regions.code")} extra={fixed ? undefined : t("regions.codeHint")}>
          <Input maxLength={40} disabled={fixed} />
        </Form.Item>
      </Form>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
    </Modal>
  );
}
