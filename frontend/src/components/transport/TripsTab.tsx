"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Progress,
  Radio,
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
import { ScanOutlined, UploadOutlined } from "@ant-design/icons";
import {
  transportApi,
  type TransportException,
  type TransportLine,
  type TransportTrip,
  type TripDetail,
} from "@/lib/api/transport";
import { getStorageUrl } from "@/lib/api/client";
import { LineTable, ReasonModal } from "./OrdersTab";
import { ResolveModal } from "./ExceptionsTab";
import { Place, TripStatusTag, Vin, fmtTime, notifyError, useTransportText } from "./shared";

interface Props {
  internal: boolean;
  canManage: boolean;
  onOpenTrip: (tripId: string) => void;
}

export function TripsTab({ onOpenTrip }: Props) {
  const t = useTransportText();
  const [status, setStatus] = useState("PLANNED,LOADING,IN_TRANSIT");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TransportTrip[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await transportApi.trips({ status, search, page, pageSize: 20 });
      if (n === seq.current) {
        setRows(r.items);
        setTotal(r.total);
      }
    } catch (e) {
      if (n === seq.current) notifyError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [status, search, page]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          style={{ width: 200 }}
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
          options={[
            { value: "PLANNED,LOADING,IN_TRANSIT", label: `${t("T_PLANNED")} / ${t("T_LOADING")} / ${t("T_IN_TRANSIT")}` },
            { value: "COMPLETED", label: t("T_COMPLETED") },
            { value: "CANCELLED", label: t("T_CANCELLED") },
            { value: "", label: t("all") },
          ]}
        />
        <Input.Search
          allowClear
          placeholder={`${t("tripCode")} / ${t("trailer")} / ${t("driver")} / VIN`}
          style={{ width: 280 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
        <Button onClick={() => void load()}>{t("refresh")}</Button>
      </Space>
      <Table<TransportTrip>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        onRow={(r) => ({ onClick: () => onOpenTrip(r.id), style: { cursor: "pointer" } })}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: t("tripCode"),
            dataIndex: "code",
            width: 150,
            render: (v, r) => (
              <Badge count={r.open_exceptions ?? 0} size="small" offset={[8, 0]}>
                {v}
              </Badge>
            ),
          },
          { title: t("carrier"), dataIndex: "carrier_name" },
          {
            title: `${t("trailer")} / ${t("driver")}`,
            render: (_, r) => (
              <Space direction="vertical" size={0}>
                <span>
                  {r.plate_number} <Tag>{r.tow_type}</Tag>
                </span>
                <Typography.Text type="secondary">{r.driver_name}</Typography.Text>
              </Space>
            ),
          },
          {
            title: `${t("origin")} → ${t("destination")}`,
            render: (_, r) => (
              <Typography.Text ellipsis style={{ maxWidth: 320 }}>
                {r.origins ?? "-"} → {r.destinations ?? "-"}
              </Typography.Text>
            ),
          },
          {
            title: t("progress"),
            width: 200,
            render: (_, r) => (
              <Space direction="vertical" size={0} style={{ width: "100%" }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t("loaded")} {r.loaded_count ?? 0}/{r.capacity} · {t("delivered")} {r.delivered_count ?? 0}
                </Typography.Text>
                <Progress
                  size="small"
                  showInfo={false}
                  percent={r.line_count ? ((r.delivered_count ?? 0) / r.line_count) * 100 : 0}
                  success={{ percent: r.line_count ? ((r.delivered_count ?? 0) / r.line_count) * 100 : 0 }}
                />
              </Space>
            ),
          },
          { title: t("status"), dataIndex: "status", width: 100, render: (v) => <TripStatusTag status={v} /> },
        ]}
      />
    </>
  );
}

export function TripDrawer({
  tripId,
  internal,
  canManage,
  onClose,
  onChanged,
}: {
  tripId: string;
  internal: boolean;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTransportText();
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<{ vin: string; options: TransportLine[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<"cancel" | "remove" | "close" | null>(null);
  const [closing, setClosing] = useState<TransportLine | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [resolving, setResolving] = useState<TransportException | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await transportApi.trip(tripId));
    } catch (e) {
      notifyError(e);
    }
  }, [tripId]);
  useEffect(() => {
    void load();
  }, [load]);
  const refresh = async () => {
    await load();
    onChanged();
  };

  const trip = detail?.trip;
  const loadable = trip && ["PLANNED", "LOADING"].includes(trip.status);
  const signing = trip?.status === "IN_TRANSIT";
  const openUnplanned = detail?.exceptions.filter((e) => e.type === "UNPLANNED_VIN" && e.status === "OPEN") ?? [];
  const notLoaded = detail?.lines.filter((l) => l.status === "DISPATCHED").length ?? 0;
  const loadedCount = detail?.lines.filter((l) => ["PICKED_UP", "IN_TRANSIT", "DELIVERED", "CLOSED"].includes(l.status)).length ?? 0;

  const scan = async (value: string, lineId?: string) => {
    const code = value.trim().toUpperCase();
    if (!code || !trip) return;
    setBusy(true);
    try {
      if (signing) {
        await transportApi.sign(trip.id, code);
        message.success(t("signedOk", { vin: code }));
      } else {
        const r = await transportApi.pickup(trip.id, code, lineId);
        if (r.result === "CHOOSE_LINE") {
          setChoice({ vin: code, options: r.options });
          return;
        }
        if (r.result === "UNPLANNED") message.warning(t("unplannedScanned", { vin: code }));
        else message.success(t("picked", { vin: code }));
      }
      setVin("");
      setChoice(null);
      await refresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const depart = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      await transportApi.depart(trip.id);
      message.success(t("departed"));
      await refresh();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (originId: string, destinationId: string, file: File) => {
    if (!trip) return;
    if (!["application/pdf", "image/jpeg"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      message.error(t("podInvalid"));
      return;
    }
    try {
      await transportApi.uploadDocument(trip.id, originId, destinationId, file);
      message.success(t("uploaded"));
      await refresh();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Drawer open width={1100} onClose={onClose} title={trip ? `${trip.code} · ${trip.carrier_name}` : " "} destroyOnClose>
      {trip && detail && (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions size="small" bordered column={4}>
            <Descriptions.Item label={t("trailer")}>
              {trip.plate_number} <Tag>{trip.tow_type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t("driver")}>
              {trip.driver_name} {trip.driver_phone ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label={t("loaded")}>
              {loadedCount} / {trip.capacity}
            </Descriptions.Item>
            <Descriptions.Item label={t("status")}>
              <TripStatusTag status={trip.status} />
            </Descriptions.Item>
            {trip.cancel_reason && (
              <Descriptions.Item label={t("reason")} span={4}>
                {trip.cancel_reason}
              </Descriptions.Item>
            )}
          </Descriptions>

          {(loadable || signing) && (
            <Card size="small">
              <Space wrap>
                <Input
                  prefix={<ScanOutlined />}
                  style={{ width: 320 }}
                  placeholder={t("vinPlaceholder")}
                  value={vin}
                  disabled={busy}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  onPressEnter={() => void scan(vin)}
                  addonBefore={signing ? t("scanSign") : t("scanPickup")}
                />
                {loadable && (
                  <Popconfirm
                    title={t("departConfirm", { n: notLoaded })}
                    onConfirm={depart}
                    disabled={!loadedCount || openUnplanned.length > 0}
                  >
                    <Button type="primary" disabled={!loadedCount || openUnplanned.length > 0} loading={busy}>
                      {t("depart")}
                    </Button>
                  </Popconfirm>
                )}
                {loadable && canManage && (
                  <>
                    <Button disabled={!selected.length} onClick={() => setAction("remove")}>
                      {t("removeFromTrip")} {selected.length ? `(${selected.length})` : ""}
                    </Button>
                    <Button danger type="text" onClick={() => setAction("cancel")}>
                      {t("cancelTrip")}
                    </Button>
                  </>
                )}
                <Button onClick={() => setExceptionOpen(true)}>{t("recordException")}</Button>
              </Space>
            </Card>
          )}

          {openUnplanned.length > 0 && (
            <Card size="small" title={t("UNPLANNED_VIN")} styles={{ header: { color: "#b45309" } }}>
              <List
                size="small"
                dataSource={openUnplanned}
                renderItem={(e) => (
                  <List.Item
                    actions={
                      internal
                        ? [
                            <Button key="r" size="small" type="primary" onClick={() => setResolving(e)}>
                              {t("resolve")}
                            </Button>,
                          ]
                        : []
                    }
                  >
                    <Vin vin={e.vin} /> · {e.reported_by_name} · {fmtTime(e.reported_at)}
                  </List.Item>
                )}
              />
            </Card>
          )}

          <Card size="small" title={`${t("legs")} · ${t("legHint")}`}>
            <List
              grid={{ gutter: 12, column: 2 }}
              dataSource={detail.legs}
              renderItem={(leg) => (
                <List.Item>
                  <Card size="small">
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <span>
                        <Place code={leg.originCode} name={leg.originName} /> →{" "}
                        <Place code={leg.destinationCode} name={leg.destinationName} />
                      </span>
                      <Typography.Text type="secondary">
                        {t("lineCount")} {leg.lines} · {t("loaded")} {leg.loaded} · {t("delivered")} {leg.delivered}
                      </Typography.Text>
                      <Space wrap>
                        {leg.documents.map((d) => (
                          <a key={d.id} href={getStorageUrl(d.file_key)} target="_blank" rel="noreferrer">
                            {d.file_name}
                          </a>
                        ))}
                        {trip.status !== "CANCELLED" && leg.loaded > 0 && (
                          <Upload
                            accept="application/pdf,image/jpeg"
                            showUploadList={false}
                            beforeUpload={(file) => {
                              void upload(leg.originId, leg.destinationId, file);
                              return false;
                            }}
                          >
                            <Button size="small" icon={<UploadOutlined />}>
                              {t("uploadPod")}
                            </Button>
                          </Upload>
                        )}
                      </Space>
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
          </Card>

          <Tabs
            items={[
              {
                key: "lines",
                label: `${t("lines")} (${detail.lines.length})`,
                children: (
                  <LineTable
                    lines={detail.lines}
                    selection={
                      loadable && canManage
                        ? {
                            selectedRowKeys: selected,
                            onChange: (keys) => setSelected(keys as string[]),
                            getCheckboxProps: (l) => ({ disabled: !["DISPATCHED", "PICKED_UP"].includes(l.status) }),
                          }
                        : undefined
                    }
                    extraColumns={[
                      { title: t("customer"), dataIndex: "customer_name", width: 130 },
                      ...(internal && signing
                        ? [
                            {
                              title: "",
                              width: 150,
                              render: (_: unknown, l: TransportLine) =>
                                l.status === "IN_TRANSIT" ? (
                                  <Button size="small" type="link" danger onClick={() => setClosing(l)}>
                                    {t("closeLine")}
                                  </Button>
                                ) : null,
                            },
                          ]
                        : []),
                    ]}
                  />
                ),
              },
              {
                key: "exceptions",
                label: `${t("tabExceptions")} (${detail.exceptions.length})`,
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={detail.exceptions}
                    pagination={false}
                    columns={[
                      { title: t("exceptionType"), dataIndex: "type", render: (v) => t(v) },
                      { title: t("vin"), dataIndex: "vin", render: (v) => (v ? <Vin vin={v} /> : "-") },
                      { title: t("note"), dataIndex: "note", render: (v, e) => v || e.resolution_reason || "-" },
                      {
                        title: t("status"),
                        dataIndex: "status",
                        render: (v, e) => (
                          <Tag color={v === "OPEN" ? "orange" : "default"}>
                            {t(v)}
                            {e.resolution ? ` · ${t(`decision${e.resolution}`)}` : ""}
                          </Tag>
                        ),
                      },
                      { title: t("operator"), dataIndex: "reported_by_name" },
                      { title: t("time"), dataIndex: "reported_at", render: fmtTime },
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

      {choice && (
        <Modal open title={`${t("chooseLine")} · ${choice.vin}`} footer={null} onCancel={() => setChoice(null)}>
          <List
            dataSource={choice.options}
            renderItem={(l) => (
              <List.Item
                actions={[
                  <Button key="pick" type="primary" loading={busy} onClick={() => void scan(choice.vin, l.id)}>
                    {t("confirm")}
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={0}>
                  <Place code={l.destination_code} name={l.destination_name} />
                  <Typography.Text type="secondary">
                    {l.customer_name} · {l.order_code} · <Place code={l.origin_code} name={l.origin_name} />
                  </Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </Modal>
      )}
      {action === "cancel" && trip && (
        <ReasonModal
          title={t("cancelTrip")}
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            await transportApi.cancelTrip(trip.id, reason);
            setAction(null);
            await refresh();
          }}
        />
      )}
      {action === "remove" && trip && (
        <ReasonModal
          title={t("removeFromTrip")}
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            await transportApi.removeTripLines(trip.id, selected, reason);
            setAction(null);
            setSelected([]);
            await refresh();
          }}
        />
      )}
      {closing && (
        <ReasonModal
          title={`${t("closeLine")} · ${closing.vin}`}
          onClose={() => setClosing(null)}
          onSubmit={async (reason) => {
            await transportApi.closeLine(closing.id, reason);
            setClosing(null);
            await refresh();
          }}
        />
      )}
      {exceptionOpen && trip && (
        <ExceptionRecordModal
          tripId={trip.id}
          lines={detail?.lines ?? []}
          onClose={() => setExceptionOpen(false)}
          onDone={() => {
            setExceptionOpen(false);
            void refresh();
          }}
        />
      )}
      {resolving && (
        <ResolveModal
          exception={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            void refresh();
          }}
        />
      )}
    </Drawer>
  );
}

function ExceptionRecordModal({
  tripId,
  lines,
  onClose,
  onDone,
}: {
  tripId: string;
  lines: TransportLine[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={t("recordException")}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        const v = (await form.validateFields()) as { type: "DAMAGE" | "REFUSED" | "OTHER"; vin?: string; note: string };
        setBusy(true);
        try {
          await transportApi.recordException(tripId, v);
          message.success(t("saved"));
          onDone();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ type: "DAMAGE" }}>
        <Form.Item name="type" label={t("exceptionType")}>
          <Radio.Group
            optionType="button"
            options={(["DAMAGE", "REFUSED", "OTHER"] as const).map((k) => ({ value: k, label: t(k) }))}
          />
        </Form.Item>
        <Form.Item name="vin" label={t("vin")}>
          <Select
            allowClear
            showSearch
            options={lines.filter((l) => l.vin).map((l) => ({ value: l.vin!, label: l.vin! }))}
          />
        </Form.Item>
        <Form.Item name="note" label={t("note")} rules={[{ required: true, whitespace: true }]}>
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
