"use client";
import { Permission, usePermission } from '@/lib/auth/permissions';

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Input, Modal, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import {
  transportApi,
  type TransportException,
  type TransportLine,
  type TransportOrder,
} from "@/lib/api/transport";
import { Vin, addressOptions, fmtTime, notifyError, useCustomerAddresses, useTransportText } from "./shared";

export function ExceptionsTab({ onOpenTrip }: { onOpenTrip: (tripId: string) => void }) {
  const canResolve = usePermission(Permission.TRANSPORT_ORDER_MANAGE);
  const t = useTransportText();
  const [status, setStatus] = useState("OPEN");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TransportException[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<TransportException | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await transportApi.exceptions({ status, page, pageSize: 20 });
      if (n === seq.current) {
        setRows(r.items);
        setTotal(r.total);
      }
    } catch (e) {
      if (n === seq.current) notifyError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [status, page]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Radio.Group
          optionType="button"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          options={[
            { value: "OPEN", label: t("OPEN") },
            { value: "RECORDED", label: t("RECORDED") },
            { value: "RESOLVED", label: t("RESOLVED") },
            { value: "", label: t("all") },
          ]}
        />
      </Space>
      <Table<TransportException>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: t("exceptionType"), dataIndex: "type", width: 130, render: (v) => t(v) },
          { title: t("vin"), dataIndex: "vin", width: 190, render: (v) => (v ? <Vin vin={v} /> : "-") },
          {
            title: t("tripCode"),
            dataIndex: "trip_code",
            render: (v, e) => (
              <Space direction="vertical" size={0}>
                <a onClick={() => onOpenTrip(e.trip_id)}>{v}</a>
                <Typography.Text type="secondary">{e.carrier_name}</Typography.Text>
              </Space>
            ),
          },
          { title: t("note"), render: (_, e) => e.note || e.resolution_reason || "-" },
          { title: t("operator"), dataIndex: "reported_by_name", width: 120 },
          { title: t("time"), dataIndex: "reported_at", width: 150, render: fmtTime },
          {
            title: t("status"),
            width: 170,
            render: (_, e) =>
              e.status === "OPEN" ? (
                <Button size="small" type="primary" disabled={!canResolve} onClick={() => setResolving(e)}>
                  {t("resolve")}
                </Button>
              ) : (
                <Tag>
                  {t(e.status)}
                  {e.resolution ? ` · ${t(`decision${e.resolution}`)}` : ""}
                </Tag>
              ),
          },
        ]}
      />
      {resolving && (
        <ResolveModal
          exception={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            void load();
          }}
        />
      )}
    </>
  );
}

export function ResolveModal({
  exception,
  onClose,
  onDone,
}: {
  exception: TransportException;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const decision = Form.useWatch("decision", form) as "BIND" | "ADD" | "REJECT" | undefined;
  const orderId = Form.useWatch("orderId", form) as string | undefined;
  const [tripLines, setTripLines] = useState<TransportLine[]>([]);
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const order = orders.find((o) => o.id === orderId);
  const addresses = useCustomerAddresses(order?.customer_id);
  const places = addressOptions(addresses, t);

  useEffect(() => {
    transportApi
      .trip(exception.trip_id)
      .then((d) => {
        const open = d.lines.filter((l) => l.status === "DISPATCHED");
        setTripLines(open);
        if (!form.getFieldValue("decision")) form.setFieldValue("decision", open.length ? "BIND" : "ADD");
      })
      .catch(notifyError);
  }, [exception.trip_id, form]);

  const searchOrders = (search: string) =>
    transportApi
      .orders({ status: "OPEN", search, pageSize: 20 })
      .then((r) => setOrders(r.items))
      .catch(notifyError);
  useEffect(() => {
    void searchOrders("");
  }, []);

  return (
    <Modal
      open
      width={640}
      title={`${t("resolve")} · ${exception.vin}`}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        const v = (await form.validateFields()) as {
          decision: "BIND" | "ADD" | "REJECT";
          reason: string;
          lineId?: string;
          orderId?: string;
          originId?: string;
          destinationId?: string;
        };
        setBusy(true);
        try {
          await transportApi.resolveException(exception.id, v);
          message.success(t("saved"));
          onDone();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="decision" rules={[{ required: true }]}>
          <Radio.Group
            options={(["BIND", "ADD", "REJECT"] as const).map((k) => ({ value: k, label: t(`decision${k}`) }))}
          />
        </Form.Item>
        {decision === "BIND" && (
          <Form.Item name="lineId" label={t("targetLine")} rules={[{ required: true }]}>
            <Select
              options={tripLines.map((l) => ({
                value: l.id,
                label: `${l.vin ?? t("noVin")} · ${l.origin_name} → ${l.destination_name} · ${l.order_code}`,
              }))}
            />
          </Form.Item>
        )}
        {decision === "ADD" && (
          <>
            <Form.Item name="orderId" label={t("targetOrder")} rules={[{ required: true }]}>
              <Select
                showSearch
                filterOption={false}
                onSearch={(v) => void searchOrders(v)}
                onChange={() => form.setFieldsValue({ originId: undefined, destinationId: undefined })}
                options={orders.map((o) => ({
                  value: o.id,
                  label: `${o.code} · ${o.customer_name} · ${o.customer_request_no}`,
                }))}
              />
            </Form.Item>
            <Space style={{ width: "100%" }} styles={{ item: { flex: 1 } }}>
              <Form.Item name="originId" label={t("origin")} rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={places} disabled={!order} />
              </Form.Item>
              <Form.Item name="destinationId" label={t("destination")} rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={places} disabled={!order} />
              </Form.Item>
            </Space>
          </>
        )}
        <Form.Item name="reason" label={t("reason")} rules={[{ required: true, whitespace: true, message: t("reasonRequired") }]}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
