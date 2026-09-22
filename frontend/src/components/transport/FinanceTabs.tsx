"use client";
import { Permission, usePermission } from '@/lib/auth/permissions';

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { transportApi, type Charge, type ChargeTotals, type Tariff, type TariffInput } from "@/lib/api/transport";
import {
  Place,
  TOW_OPTIONS,
  Vin,
  addressOptions,
  fmtMoney,
  notifyError,
  useCarriers,
  useCustomerAddresses,
  useCustomers,
  useTransportText,
} from "./shared";

// ------------------------------------------------------------------ 报价
export function TariffsTab() {
  const canWrite = usePermission(Permission.TRANSPORT_FINANCE);
  const t = useTransportText();
  const customers = useCustomers(true);
  const [side, setSide] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>();
  const [rows, setRows] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Tariff | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await transportApi.tariffs({ side, customerId }));
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  }, [side, customerId]);
  useEffect(() => {
    void load();
  }, [load]);

  const today = dayjs().format("YYYY-MM-DD");
  return (
    <>
      <Typography.Paragraph type="secondary">{t("tariffHint")}</Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Radio.Group
          optionType="button"
          value={side}
          onChange={(e) => setSide(e.target.value)}
          options={[
            { value: "", label: t("all") },
            { value: "RECEIVABLE", label: t("RECEIVABLE") },
            { value: "PAYABLE", label: t("PAYABLE") },
          ]}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("customer")}
          style={{ width: 200 }}
          value={customerId}
          onChange={setCustomerId}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Button disabled={!canWrite} type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          {t("newTariff")}
        </Button>
      </Space>
      <Table<Tariff>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          {
            title: t("side"),
            dataIndex: "side",
            width: 90,
            render: (v) => <Tag color={v === "RECEIVABLE" ? "green" : "volcano"}>{t(v)}</Tag>,
          },
          { title: t("customer"), dataIndex: "customer_name" },
          { title: t("carrier"), dataIndex: "carrier_name", render: (v) => v ?? "-" },
          { title: t("origin"), render: (_, r) => <Place code={r.origin_code} name={r.origin_name} /> },
          {
            title: t("destination"),
            render: (_, r) =>
              r.destination_id ? (
                <Place code={r.destination_code} name={r.destination_name} />
              ) : (
                <Tag>{r.destination_region}</Tag>
              ),
          },
          { title: t("towType"), dataIndex: "tow_type", width: 90 },
          { title: t("price"), width: 150, render: (_, r) => fmtMoney(r.price, r.currency) },
          {
            title: `${t("validFrom")} ~ ${t("validTo")}`,
            width: 210,
            render: (_, r) => {
              const active = r.valid_from <= today && (!r.valid_to || r.valid_to >= today);
              return (
                <Typography.Text type={active ? undefined : "secondary"}>
                  {r.valid_from} ~ {r.valid_to ?? t("openEnded")}
                </Typography.Text>
              );
            },
          },
          {
            title: "",
            width: 130,
            render: (_, r) => (
              <Space size={0}>
                <Button disabled={!canWrite} type="link" size="small" onClick={() => setEditing(r)}>
                  {t("edit")}
                </Button>
                <Popconfirm
                  title={t("deleteConfirm")}
                  onConfirm={async () => {
                    try {
                      await transportApi.deleteTariff(r.id);
                      void load();
                    } catch (e) {
                      notifyError(e);
                    }
                  }}
                >
                  <Button disabled={!canWrite} type="link" size="small" danger>
                    {t("delete")}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      {editing && (
        <TariffModal
          tariff={editing === "new" ? null : editing}
          customers={customers.map((c) => ({ value: c.id, label: c.name }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function TariffModal({
  tariff,
  customers,
  onClose,
  onSaved,
}: {
  tariff: Tariff | null;
  customers: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const carriers = useCarriers(true);
  const side = Form.useWatch("side", form) as "RECEIVABLE" | "PAYABLE" | undefined;
  const customerId = Form.useWatch("customerId", form) as string | undefined;
  const destMode = Form.useWatch("destMode", form) as "store" | "region" | undefined;
  const addresses = useCustomerAddresses(customerId);
  const regions = [...new Set(addresses.map((a) => a.region).filter(Boolean))] as string[];
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      width={640}
      title={tariff ? `${t("tabTariffs")} · ${tariff.customer_name}` : t("newTariff")}
      onCancel={onClose}
      confirmLoading={busy}
      okText={t("save")}
      onOk={async () => {
        const v = (await form.validateFields()) as {
          side: "RECEIVABLE" | "PAYABLE";
          customerId: string;
          carrierId?: string;
          originId: string;
          destMode: "store" | "region";
          destinationId?: string;
          destinationRegion?: string;
          towType: TariffInput["towType"];
          price: number;
          period: [Dayjs, Dayjs | null];
          remark?: string;
        };
        const store = v.side === "RECEIVABLE" || v.destMode === "store";
        const body: TariffInput = {
          side: v.side,
          customerId: v.customerId,
          carrierId: v.side === "PAYABLE" ? v.carrierId : undefined,
          originId: v.originId,
          destinationId: store ? v.destinationId : undefined,
          destinationRegion: store ? undefined : v.destinationRegion,
          towType: v.towType,
          price: v.price,
          validFrom: v.period[0].format("YYYY-MM-DD"),
          validTo: v.period[1] ? v.period[1].format("YYYY-MM-DD") : null,
          remark: v.remark,
        };
        setBusy(true);
        try {
          if (tariff) await transportApi.updateTariff(tariff.id, body);
          else await transportApi.createTariff(body);
          message.success(t("saved"));
          onSaved();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          tariff
            ? {
                side: tariff.side,
                customerId: tariff.customer_id,
                carrierId: tariff.carrier_id ?? undefined,
                originId: tariff.origin_id,
                destMode: tariff.destination_id ? "store" : "region",
                destinationId: tariff.destination_id ?? undefined,
                destinationRegion: tariff.destination_region ?? undefined,
                towType: tariff.tow_type,
                price: Number(tariff.price),
                period: [dayjs(tariff.valid_from), tariff.valid_to ? dayjs(tariff.valid_to) : null],
                remark: tariff.remark,
              }
            : { side: "RECEIVABLE", destMode: "store", towType: "CC", period: [dayjs(), null] }
        }
      >
        <Form.Item name="side" label={t("side")}>
          <Radio.Group
            optionType="button"
            options={[
              { value: "RECEIVABLE", label: t("RECEIVABLE") },
              { value: "PAYABLE", label: t("PAYABLE") },
            ]}
          />
        </Form.Item>
        <Space style={{ width: "100%" }} styles={{ item: { flex: 1 } }}>
          <Form.Item name="customerId" label={t("customer")} rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={customers}
              onChange={() => form.setFieldsValue({ originId: undefined, destinationId: undefined })}
            />
          </Form.Item>
          {side === "PAYABLE" && (
            <Form.Item name="carrierId" label={t("carrier")} rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={carriers.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          )}
        </Space>
        <Form.Item name="originId" label={t("origin")} rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={addressOptions(addresses, t)} disabled={!customerId} />
        </Form.Item>
        {side === "PAYABLE" && (
          <Form.Item name="destMode" label={t("storeOrRegion")}>
            <Radio.Group
              options={[
                { value: "store", label: t("destinationStore") },
                { value: "region", label: t("region") },
              ]}
            />
          </Form.Item>
        )}
        {side === "RECEIVABLE" || destMode !== "region" ? (
          <Form.Item name="destinationId" label={t("destinationStore")} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={addressOptions(addresses, t)} disabled={!customerId} />
          </Form.Item>
        ) : (
          <Form.Item name="destinationRegion" label={t("region")} rules={[{ required: true, whitespace: true }]}>
            <Select
              showSearch
              options={regions.map((r) => ({ value: r, label: r }))}
              disabled={!customerId}
              notFoundContent={null}
            />
          </Form.Item>
        )}
        <Space style={{ width: "100%" }} styles={{ item: { flex: 1 } }}>
          <Form.Item name="towType" label={t("towType")} rules={[{ required: true }]}>
            <Select options={TOW_OPTIONS} />
          </Form.Item>
          <Form.Item name="price" label={t("price")} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Space>
        <Form.Item name="period" label={`${t("validFrom")} ~ ${t("validTo")}`} rules={[{ required: true }]}>
          <DatePicker.RangePicker allowEmpty={[false, true]} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="remark" label={t("remark")}>
          <Input maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------------ 费用
export function ChargesTab({ onOpenTrip }: { onOpenTrip: (id: string) => void }) {
  const canWrite = usePermission(Permission.TRANSPORT_FINANCE);
  const t = useTransportText();
  const customers = useCustomers(true);
  const carriers = useCarriers(true);
  const [filters, setFilters] = useState<{
    side?: string;
    customerId?: string;
    carrierId?: string;
    pricing?: string;
    status?: string;
    vin?: string;
    range?: [Dayjs, Dayjs] | null;
  }>({ status: "PENDING" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Charge[]>([]);
  const [totals, setTotals] = useState<ChargeTotals[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adjusting, setAdjusting] = useState<Charge | null>(null);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await transportApi.charges({
        side: filters.side,
        customerId: filters.customerId,
        carrierId: filters.carrierId,
        pricing: filters.pricing,
        status: filters.status,
        vin: filters.vin,
        from: filters.range?.[0]?.format("YYYY-MM-DD"),
        to: filters.range?.[1]?.format("YYYY-MM-DD"),
        page,
        pageSize: 100,
      });
      if (n === seq.current) {
        setRows(r.items);
        setTotals(r.totals);
        setTotal(r.total);
        setSelected([]);
      }
    } catch (e) {
      if (n === seq.current) notifyError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [filters, page]);
  useEffect(() => {
    void load();
  }, [load]);
  const patch = (p: Partial<typeof filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...p }));
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Radio.Group
          optionType="button"
          value={filters.side ?? ""}
          onChange={(e) => patch({ side: e.target.value || undefined })}
          options={[
            { value: "", label: t("all") },
            { value: "RECEIVABLE", label: t("RECEIVABLE") },
            { value: "PAYABLE", label: t("PAYABLE") },
          ]}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("customer")}
          style={{ width: 170 }}
          onChange={(v) => patch({ customerId: v })}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("carrier")}
          style={{ width: 170 }}
          onChange={(v) => patch({ carrierId: v })}
          options={carriers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <DatePicker.RangePicker onChange={(v) => patch({ range: (v as [Dayjs, Dayjs]) ?? null })} />
        <Select
          allowClear
          placeholder={t("pricing")}
          style={{ width: 120 }}
          onChange={(v) => patch({ pricing: v })}
          options={(["TARIFF", "UNPRICED", "MANUAL"] as const).map((k) => ({ value: k, label: t(k) }))}
        />
        <Select
          allowClear
          style={{ width: 110 }}
          value={filters.status}
          onChange={(v) => patch({ status: v })}
          options={(["PENDING", "CONFIRMED"] as const).map((k) => ({ value: k, label: t(k) }))}
        />
        <Input.Search allowClear placeholder="VIN" style={{ width: 180 }} onSearch={(v) => patch({ vin: v || undefined })} />
      </Space>
      <Space wrap style={{ marginBottom: 12 }} size={12}>
        {totals.map((x) => (
          <Card key={`${x.side}-${x.currency}`} size="small" style={{ minWidth: 220 }}>
            <Statistic title={`${t(x.side)} · ${x.count}`} value={fmtMoney(x.amount, x.currency)} />
            {x.unpriced > 0 && <Tag color="orange">{t("unpricedCount", { n: x.unpriced })}</Tag>}
          </Card>
        ))}
      </Space>
      <Space style={{ marginBottom: 12 }}>
        <Button
          disabled={!canWrite || !selected.length}
          onClick={async () => {
            try {
              const r = await transportApi.confirmCharges(selected);
              message.success(`${t("CONFIRMED")} ${r.confirmed}`);
              void load();
            } catch (e) {
              notifyError(e);
            }
          }}
        >
          {t("confirmSelected")} {selected.length ? `(${selected.length})` : ""}
        </Button>
        <Button disabled={!canWrite} onClick={() => setRecalcOpen(true)}>{t("recalculate")}</Button>
      </Space>
      <Table<Charge>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1300 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (k) => setSelected(k as string[]),
          getCheckboxProps: (c) => ({ disabled: c.status !== "PENDING" }),
        }}
        pagination={{ current: page, pageSize: 100, total, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: t("serviceDate"), dataIndex: "service_date", width: 110 },
          {
            title: t("side"),
            dataIndex: "side",
            width: 80,
            render: (v) => <Tag color={v === "RECEIVABLE" ? "green" : "volcano"}>{t(v)}</Tag>,
          },
          { title: t("vin"), dataIndex: "vin", width: 190, render: (v) => <Vin vin={v} /> },
          {
            title: t("tripCode"),
            dataIndex: "trip_code",
            width: 140,
            render: (v, c) => <a onClick={() => onOpenTrip(c.trip_id)}>{v}</a>,
          },
          { title: t("customer"), dataIndex: "customer_name", width: 130 },
          { title: t("carrier"), dataIndex: "carrier_name", width: 130, render: (v, c) => (c.side === "PAYABLE" ? v : "-") },
          {
            title: `${t("origin")} → ${t("destination")}`,
            render: (_, c) => (
              <span>
                <Place code={c.origin_code} name={c.origin_name} /> → <Place code={c.destination_code} name={c.destination_name} />
              </span>
            ),
          },
          { title: t("towType"), dataIndex: "tow_type", width: 80 },
          {
            title: t("amount"),
            width: 170,
            align: "right",
            render: (_, c) => (
              <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
                <span>{fmtMoney(c.amount, c.currency)}</span>
                <Tag color={c.pricing === "UNPRICED" ? "orange" : c.pricing === "MANUAL" ? "purple" : "default"}>
                  {t(c.pricing)}
                </Tag>
              </Space>
            ),
          },
          {
            title: t("status"),
            width: 150,
            render: (_, c) =>
              c.status === "PENDING" ? (
                <Button disabled={!canWrite} size="small" type="link" onClick={() => setAdjusting(c)}>
                  {t("adjust")}
                </Button>
              ) : (
                <Tag color="green">{t("CONFIRMED")}</Tag>
              ),
          },
        ]}
      />
      {adjusting && (
        <AdjustModal
          charge={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={() => {
            setAdjusting(null);
            void load();
          }}
        />
      )}
      {recalcOpen && (
        <RecalcModal
          customers={customers.map((c) => ({ value: c.id, label: c.name }))}
          onClose={() => setRecalcOpen(false)}
          onDone={() => {
            setRecalcOpen(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function AdjustModal({ charge, onClose, onDone }: { charge: Charge; onClose: () => void; onDone: () => void }) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={`${t("adjust")} · ${charge.vin} · ${t(charge.side)}`}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        const v = (await form.validateFields()) as { amount: number; reason: string };
        setBusy(true);
        try {
          await transportApi.adjustCharge(charge.id, v.amount, v.reason);
          message.success(t("saved"));
          onDone();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ amount: Number(charge.amount) }}>
        <Form.Item name="amount" label={`${t("amount")} (${charge.currency})`} rules={[{ required: true }]}>
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="reason" label={t("reason")} rules={[{ required: true, whitespace: true, message: t("reasonRequired") }]}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RecalcModal({
  customers,
  onClose,
  onDone,
}: {
  customers: { value: string; label: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={t("recalculate")}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        const v = (await form.validateFields()) as { range?: [Dayjs, Dayjs]; customerId?: string; includeManual?: boolean };
        setBusy(true);
        try {
          const r = await transportApi.recalculate({
            from: v.range?.[0]?.format("YYYY-MM-DD"),
            to: v.range?.[1]?.format("YYYY-MM-DD"),
            customerId: v.customerId,
            includeManual: v.includeManual,
          });
          message.success(t("recalculated", { checked: r.checked, updated: r.updated }));
          onDone();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Typography.Paragraph type="secondary">{t("recalculateHint")}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="range" label={t("serviceDate")}>
          <DatePicker.RangePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="customerId" label={t("customer")}>
          <Select allowClear showSearch optionFilterProp="label" options={customers} />
        </Form.Item>
        <Form.Item name="includeManual" valuePropName="checked">
          <Checkbox>{t("includeManual")}</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
