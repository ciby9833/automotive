"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  Upload,
  message,
} from "antd";
import { DownloadOutlined, MinusCircleOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import {
  transportApi,
  type CreateOrderInput,
  type ImportResult,
  type ImportRow,
  type OrderDetail,
  type TowType,
  type TransportLine,
  type TransportOrder,
} from "@/lib/api/transport";
import { getStorageUrl } from "@/lib/api/client";
import {
  LineStatusTag,
  OrderStatusTag,
  Place,
  TOW_OPTIONS,
  Vin,
  addressOptions,
  errorText,
  fmtTime,
  notifyError,
  useCarriers,
  useCustomerAddresses,
  useCustomers,
  useTransportText,
} from "./shared";
import { downloadTransportTemplate, readTransportExcel, splitVins } from "./excel";

interface Props {
  internal: boolean;
  onOpenTrip: (tripId: string) => void;
}

export function OrdersTab({ internal, onOpenTrip }: Props) {
  const t = useTransportText();
  const customers = useCustomers(internal);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("OPEN");
  const [customerId, setCustomerId] = useState<string>();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TransportOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await transportApi.orders({ search, status, customerId, page, pageSize: 20 });
      if (n === seq.current) {
        setRows(r.items);
        setTotal(r.total);
      }
    } catch (e) {
      if (n === seq.current) notifyError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [search, status, customerId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder={`${t("orderCode")} / ${t("requestNo")} / VIN`}
          style={{ width: 280 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <Select
          style={{ width: 130 }}
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
          options={[
            { value: "", label: t("all") },
            { value: "OPEN", label: t("O_OPEN") },
            { value: "COMPLETED", label: t("O_COMPLETED") },
            { value: "CANCELLED", label: t("O_CANCELLED") },
          ]}
        />
        {internal && (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("customer")}
            style={{ width: 200 }}
            value={customerId}
            onChange={(v) => {
              setPage(1);
              setCustomerId(v);
            }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        {internal && (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {t("newOrder")}
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              {t("importExcel")}
            </Button>
            <Button icon={<DownloadOutlined />} onClick={downloadTransportTemplate}>
              {t("downloadTemplate")}
            </Button>
          </>
        )}
      </Space>
      <Table<TransportOrder>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: "pointer" } })}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: t("orderCode"), dataIndex: "code", width: 150 },
          { title: t("customer"), dataIndex: "customer_name" },
          { title: t("requestNo"), dataIndex: "customer_request_no" },
          { title: t("pickupDate"), dataIndex: "planned_pickup_date", width: 120, render: (v) => v ?? "-" },
          {
            title: t("progress"),
            width: 220,
            render: (_, r) => (
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Progress
                  size="small"
                  percent={r.line_count ? Math.round(((r.delivered_count ?? 0) / r.line_count) * 100) : 0}
                  format={() => `${r.delivered_count ?? 0}/${r.line_count ?? 0}`}
                />
                <Space size={4} wrap>
                  {!!r.unallocated_count && <Tag color="orange">{t("unallocated", { n: r.unallocated_count })}</Tag>}
                  {!!r.missing_vin_count && <Tag color="gold">{t("missingVin", { n: r.missing_vin_count })}</Tag>}
                </Space>
              </Space>
            ),
          },
          { title: t("status"), dataIndex: "status", width: 100, render: (v) => <OrderStatusTag status={v} /> },
        ]}
      />
      {openId && (
        <OrderDrawer
          orderId={openId}
          internal={internal}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onOpenTrip={onOpenTrip}
        />
      )}
      {createOpen && (
        <CreateOrderModal
          customers={customers.map((c) => ({ value: c.id, label: c.name }))}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            void load();
            setOpenId(id);
          }}
        />
      )}
      {importOpen && (
        <ImportModal
          customers={customers.map((c) => ({ value: c.id, label: c.name }))}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void load();
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ 新建
type LineForm = {
  vin?: string;
  quantity?: number;
  originId?: string;
  destinationId?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  towType?: TowType;
  carrierId?: string;
};

function CreateOrderModal({
  customers,
  onClose,
  onCreated,
}: {
  customers: { value: string; label: string }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const customerId = Form.useWatch("customerId", form) as string | undefined;
  const addresses = useCustomerAddresses(customerId);
  const carriers = useCarriers(true);
  const places = addressOptions(addresses, t);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = (await form.validateFields()) as {
      customerId: string;
      customerRequestNo: string;
      pickup?: Dayjs;
      delivery?: Dayjs;
      remark?: string;
      lines: LineForm[];
    };
    const body: CreateOrderInput = {
      customerId: v.customerId,
      customerRequestNo: v.customerRequestNo.trim(),
      plannedPickupDate: v.pickup?.format("YYYY-MM-DD"),
      plannedDeliveryDate: v.delivery?.format("YYYY-MM-DD"),
      remark: v.remark,
      lines: v.lines.map((l) => ({
        vin: l.vin?.trim().toUpperCase() || undefined,
        quantity: l.vin?.trim() ? undefined : (l.quantity ?? 1),
        originId: l.originId!,
        destinationId: l.destinationId!,
        vehicleModel: l.vehicleModel,
        vehicleColor: l.vehicleColor,
        towType: l.towType,
        carrierId: l.carrierId,
      })),
    };
    setBusy(true);
    try {
      const order = await transportApi.createOrder(body);
      message.success(t("saved"));
      onCreated(order.id);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open width={1080} title={t("newOrder")} onCancel={onClose} onOk={submit} confirmLoading={busy} okText={t("save")}>
      <Form form={form} layout="vertical" initialValues={{ lines: [{ quantity: 1 }] }}>
        <Space wrap align="start">
          <Form.Item name="customerId" label={t("customer")} rules={[{ required: true }]} style={{ width: 240 }}>
            <Select showSearch optionFilterProp="label" options={customers} onChange={() => form.setFieldValue("lines", [{ quantity: 1 }])} />
          </Form.Item>
          <Form.Item name="customerRequestNo" label={t("requestNo")} rules={[{ required: true, whitespace: true }]} style={{ width: 200 }}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="pickup" label={t("pickupDate")}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="delivery" label={t("deliveryDate")}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="remark" label={t("remark")} style={{ width: 220 }}>
            <Input maxLength={1000} />
          </Form.Item>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {customerId ? t("vinOrQty") : t("chooseCustomerFirst")}
        </Typography.Paragraph>
        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Space key={f.key} align="start" wrap={false} style={{ display: "flex" }} size={6}>
                  <Form.Item name={[f.name, "vin"]} style={{ width: 190 }}>
                    <Input placeholder="VIN" disabled={!customerId} />
                  </Form.Item>
                  <Form.Item name={[f.name, "quantity"]} style={{ width: 80 }}>
                    <InputNumber min={1} max={500} placeholder={t("quantity")} disabled={!customerId} />
                  </Form.Item>
                  <Form.Item name={[f.name, "originId"]} rules={[{ required: true, message: t("origin") }]} style={{ width: 190 }}>
                    <Select showSearch optionFilterProp="label" placeholder={t("origin")} options={places} disabled={!customerId} />
                  </Form.Item>
                  <Form.Item name={[f.name, "destinationId"]} rules={[{ required: true, message: t("destination") }]} style={{ width: 190 }}>
                    <Select showSearch optionFilterProp="label" placeholder={t("destination")} options={places} disabled={!customerId} />
                  </Form.Item>
                  <Form.Item name={[f.name, "vehicleModel"]} style={{ width: 90 }}>
                    <Input placeholder={t("model")} />
                  </Form.Item>
                  <Form.Item name={[f.name, "towType"]} style={{ width: 110 }}>
                    <Select allowClear placeholder={t("towType")} options={TOW_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, "carrierId"]}
                    style={{ width: 130 }}
                    dependencies={[["lines", f.name, "towType"]]}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator: (_, value) =>
                          !value || getFieldValue(["lines", f.name, "towType"])
                            ? Promise.resolve()
                            : Promise.reject(new Error(t("towType"))),
                      }),
                    ]}
                  >
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={t("carrier")}
                      options={carriers.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Form.Item>
                  {fields.length > 1 && (
                    <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(f.name)} />
                  )}
                </Space>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} disabled={!customerId}>
                {t("addRow")}
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------------ 导入
function ImportModal({
  customers,
  onClose,
  onImported,
}: {
  customers: { value: string; label: string }[];
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTransportText();
  const [customerId, setCustomerId] = useState<string>();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = async (cid: string, data: ImportRow[]) => {
    setBusy(true);
    try {
      setResult(await transportApi.importOrders(cid, data, true));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!customerId || !result || result.errors.length) return;
    setBusy(true);
    try {
      const r = await transportApi.importOrders(customerId, rows, false);
      if (r.errors.length) setResult(r);
      else {
        message.success(t("importDone", { n: r.created.length }));
        onImported();
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const lines = result?.orders.reduce((n, o) => n + o.lineCount, 0) ?? 0;
  return (
    <Modal
      open
      width={880}
      title={t("importExcel")}
      onCancel={onClose}
      okText={t("importConfirm")}
      okButtonProps={{ disabled: !result || !!result.errors.length || !result.orders.length }}
      onOk={confirm}
      confirmLoading={busy}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Typography.Text type="secondary">{t("importHint")}</Typography.Text>
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t("customer")}
            style={{ width: 240 }}
            value={customerId}
            options={customers}
            onChange={(v) => {
              setCustomerId(v);
              if (rows.length) void preview(v, rows);
            }}
          />
          <Upload
            accept=".xlsx,.xls,.csv"
            showUploadList={false}
            beforeUpload={async (file) => {
              try {
                const data = await readTransportExcel(file);
                setRows(data);
                setFileName(file.name);
                setResult(null);
                if (customerId) await preview(customerId, data);
              } catch (e) {
                message.error(errorText(e));
              }
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} disabled={!customerId}>
              {fileName || t("importExcel")}
            </Button>
          </Upload>
          <Button type="link" icon={<DownloadOutlined />} onClick={downloadTransportTemplate}>
            {t("downloadTemplate")}
          </Button>
        </Space>
        {result && result.errors.length > 0 && (
          <>
            <Alert type="error" showIcon message={t("importErrors", { n: new Set(result.errors.map((e) => e.row)).size })} />
            <Table
              size="small"
              rowKey={(r, i) => `${r.row}-${i}`}
              dataSource={result.errors}
              pagination={{ pageSize: 8 }}
              columns={[
                { title: t("row"), dataIndex: "row", width: 70 },
                { title: t("reason"), dataIndex: "message" },
              ]}
            />
          </>
        )}
        {result && !result.errors.length && (
          <>
            <Alert type="success" showIcon message={t("importReady", { orders: result.orders.length, lines })} />
            <Table
              size="small"
              rowKey="customerRequestNo"
              dataSource={result.orders}
              pagination={false}
              columns={[
                { title: t("requestNo"), dataIndex: "customerRequestNo" },
                { title: t("lineCount"), dataIndex: "lineCount", width: 80 },
                { title: t("withVin"), dataIndex: "withVin", width: 90 },
                { title: t("preAllocated"), dataIndex: "allocated", width: 120 },
                { title: t("pickupDate"), dataIndex: "plannedPickupDate", width: 120, render: (v) => v ?? "-" },
              ]}
            />
          </>
        )}
      </Space>
    </Modal>
  );
}

// ------------------------------------------------------------------ 详情
function OrderDrawer({
  orderId,
  internal,
  onClose,
  onChanged,
  onOpenTrip,
}: {
  orderId: string;
  internal: boolean;
  onClose: () => void;
  onChanged: () => void;
  onOpenTrip: (id: string) => void;
}) {
  const t = useTransportText();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<"order" | "lines" | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await transportApi.order(orderId));
      setSelected([]);
    } catch (e) {
      notifyError(e);
    }
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const emptyLines = useMemo(
    () => detail?.lines.filter((l) => !l.vin && ["UNALLOCATED", "ALLOCATED", "DISPATCHED"].includes(l.status)) ?? [],
    [detail],
  );
  const cancellable = useMemo(
    () => new Set(detail?.lines.filter((l) => ["UNALLOCATED", "ALLOCATED", "DISPATCHED"].includes(l.status)).map((l) => l.id)),
    [detail],
  );
  const o = detail?.order;

  return (
    <Drawer open width={1100} onClose={onClose} title={o ? `${o.code} · ${o.customer_name}` : " "} destroyOnClose>
      {o && detail && (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions size="small" column={4} bordered>
            <Descriptions.Item label={t("requestNo")}>{o.customer_request_no}</Descriptions.Item>
            <Descriptions.Item label={t("pickupDate")}>{o.planned_pickup_date ?? "-"}</Descriptions.Item>
            <Descriptions.Item label={t("deliveryDate")}>{o.planned_delivery_date ?? "-"}</Descriptions.Item>
            <Descriptions.Item label={t("status")}>
              <OrderStatusTag status={o.status} />
            </Descriptions.Item>
            {o.remark && (
              <Descriptions.Item label={t("remark")} span={4}>
                {o.remark}
              </Descriptions.Item>
            )}
          </Descriptions>
          {internal && o.status === "OPEN" && (
            <Space wrap>
              <Button disabled={!emptyLines.length} onClick={() => setSupplementOpen(true)}>
                {t("supplementVin")} {emptyLines.length ? `(${emptyLines.length})` : ""}
              </Button>
              <Button danger disabled={!selected.length} onClick={() => setReasonAction("lines")}>
                {t("cancelLines")} {selected.length ? `(${selected.length})` : ""}
              </Button>
              <Button danger type="text" onClick={() => setReasonAction("order")}>
                {t("cancelOrder")}
              </Button>
            </Space>
          )}
          <Tabs
            items={[
              {
                key: "lines",
                label: `${t("lines")} (${detail.lines.filter((l) => l.status !== "CANCELLED").length})`,
                children: (
                  <LineTable
                    lines={detail.lines}
                    onOpenTrip={onOpenTrip}
                    selection={
                      internal && o.status === "OPEN"
                        ? {
                            selectedRowKeys: selected,
                            onChange: (keys) => setSelected(keys as string[]),
                            getCheckboxProps: (l: TransportLine) => ({ disabled: !cancellable.has(l.id) }),
                          }
                        : undefined
                    }
                  />
                ),
              },
              {
                key: "docs",
                label: `${t("documents")} (${detail.documents.length})`,
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={detail.documents}
                    pagination={false}
                    columns={[
                      { title: t("tripCode"), dataIndex: "trip_code" },
                      {
                        title: t("documents"),
                        dataIndex: "file_name",
                        render: (v, d) => (
                          <a href={getStorageUrl(d.file_key)} target="_blank" rel="noreferrer">
                            {v}
                          </a>
                        ),
                      },
                      { title: t("time"), dataIndex: "created_at", render: fmtTime },
                    ]}
                  />
                ),
              },
              ...(internal
                ? [
                    {
                      key: "events",
                      label: t("events"),
                      children: (
                        <Timeline
                          items={detail.events.map((e) => ({
                            children: (
                              <Space direction="vertical" size={0}>
                                <span>
                                  <b>{t(e.action)}</b> {e.vin && <Typography.Text code>{e.vin}</Typography.Text>}
                                </span>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  {fmtTime(e.created_at)} · {e.operator_name}
                                  {e.reason ? ` · ${e.reason}` : ""}
                                </Typography.Text>
                              </Space>
                            ),
                          }))}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Space>
      )}
      {supplementOpen && detail && (
        <SupplementModal
          orderId={orderId}
          lines={emptyLines}
          onClose={() => setSupplementOpen(false)}
          onDone={() => {
            setSupplementOpen(false);
            void refresh();
          }}
        />
      )}
      {reasonAction && (
        <ReasonModal
          title={reasonAction === "order" ? t("cancelOrder") : t("cancelLines")}
          hint={reasonAction === "order" ? t("cancelOrderHint") : undefined}
          onClose={() => setReasonAction(null)}
          onSubmit={async (reason) => {
            if (reasonAction === "order") await transportApi.cancelOrder(orderId, reason);
            else await transportApi.cancelLines(selected, reason);
            setReasonAction(null);
            await refresh();
          }}
        />
      )}
    </Drawer>
  );
}

export function LineTable({
  lines,
  onOpenTrip,
  selection,
  extraColumns = [],
}: {
  lines: TransportLine[];
  onOpenTrip?: (id: string) => void;
  selection?: {
    selectedRowKeys: string[];
    onChange: (keys: React.Key[]) => void;
    getCheckboxProps?: (l: TransportLine) => { disabled: boolean };
  };
  extraColumns?: object[];
}) {
  const t = useTransportText();
  return (
    <Table<TransportLine>
      size="small"
      rowKey="id"
      dataSource={lines}
      rowSelection={selection}
      pagination={lines.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
      scroll={{ x: 1000 }}
      columns={[
        { title: "#", dataIndex: "line_no", width: 50 },
        { title: t("vin"), dataIndex: "vin", width: 190, render: (v) => <Vin vin={v} /> },
        ...(extraColumns as never[]),
        { title: t("origin"), render: (_, l) => <Place code={l.origin_code} name={l.origin_name} /> },
        { title: t("destination"), render: (_, l) => <Place code={l.destination_code} name={l.destination_name} /> },
        {
          title: t("vehicle"),
          render: (_, l) => [l.vehicle_model, l.vehicle_color].filter(Boolean).join(" / ") || "-",
        },
        { title: t("towType"), dataIndex: "tow_type", width: 90, render: (v) => v ?? "-" },
        { title: t("carrier"), dataIndex: "carrier_name", render: (v, l) => l.carrier_short_name ?? v ?? "-" },
        {
          title: t("tripCode"),
          dataIndex: "trip_code",
          width: 140,
          render: (v, l) =>
            v && onOpenTrip ? (
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTrip(l.trip_id!);
                }}
              >
                {v}
              </a>
            ) : (
              (v ?? "-")
            ),
        },
        {
          title: t("status"),
          dataIndex: "status",
          width: 110,
          render: (v, l) => (
            <Space direction="vertical" size={0}>
              <LineStatusTag status={v} />
              {l.end_reason && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {l.end_reason}
                </Typography.Text>
              )}
            </Space>
          ),
        },
      ]}
    />
  );
}

function SupplementModal({
  orderId,
  lines,
  onClose,
  onDone,
}: {
  orderId: string;
  lines: TransportLine[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTransportText();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const paste = (text: string) => {
    const vins = splitVins(text);
    const next = { ...values };
    lines.forEach((l, i) => {
      if (vins[i]) next[l.id] = vins[i];
    });
    setValues(next);
  };
  const submit = async () => {
    const items = Object.entries(values)
      .map(([lineId, vin]) => ({ lineId, vin: vin.trim().toUpperCase() }))
      .filter((i) => i.vin);
    if (!items.length) return onClose();
    setBusy(true);
    try {
      await transportApi.supplementVins(orderId, items);
      message.success(t("saved"));
      onDone();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open width={820} title={t("supplementVin")} onCancel={onClose} onOk={submit} confirmLoading={busy} okText={t("save")}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">{t("supplementHint")}</Typography.Text>
        <Input.TextArea rows={3} placeholder={t("pasteVins")} onChange={(e) => paste(e.target.value)} />
        <Table
          size="small"
          rowKey="id"
          dataSource={lines}
          pagination={false}
          scroll={{ y: 360 }}
          columns={[
            { title: "#", dataIndex: "line_no", width: 50 },
            { title: t("origin"), render: (_, l) => <Place code={l.origin_code} name={l.origin_name} /> },
            { title: t("destination"), render: (_, l) => <Place code={l.destination_code} name={l.destination_name} /> },
            {
              title: t("vin"),
              width: 230,
              render: (_, l) => (
                <Input
                  value={values[l.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [l.id]: e.target.value.toUpperCase() })}
                />
              ),
            },
          ]}
        />
      </Space>
    </Modal>
  );
}

export function ReasonModal({
  title,
  hint,
  onClose,
  onSubmit,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const t = useTransportText();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      okButtonProps={{ danger: true, disabled: !reason.trim() }}
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          await onSubmit(reason.trim());
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {hint && <Alert type="info" showIcon message={hint} style={{ marginBottom: 12 }} />}
      <Input.TextArea rows={3} maxLength={1000} placeholder={t("reasonRequired")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
