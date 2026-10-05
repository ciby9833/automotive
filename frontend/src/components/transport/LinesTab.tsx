"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, DatePicker, Input, Select, Space, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import * as XLSX from "xlsx";
import { transportApi, type TransportLine } from "@/lib/api/transport";
import { LineTable } from "./OrdersTab";
import {
  TOW_OPTIONS,
  addressOptions,
  notifyError,
  useCarriers,
  useCustomerAddresses,
  useCustomers,
  useTransportText,
} from "./shared";
import type { TransportT } from "./copy";

const PAGE_SIZE = 100;
const DATE_FIELDS = ["plannedPickup", "plannedDelivery", "pickedUp", "delivered"] as const;
const STATUSES = [
  "UNALLOCATED",
  "ALLOCATED",
  "DISPATCHED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
] as const;

/** 全状态的按台明细：业务要按不同日期维度查，并导出给客户或内部对账 */
export function LinesTab({ onOpenTrip }: { onOpenTrip: (tripId: string) => void }) {
  const t = useTransportText();
  const customers = useCustomers(true);
  const carriers = useCarriers(true);
  const [customerId, setCustomerId] = useState<string>();
  const addresses = useCustomerAddresses(customerId);
  const places = addressOptions(addresses, t);
  const [carrierId, setCarrierId] = useState<string>();
  const [originId, setOriginId] = useState<string>();
  const [destinationId, setDestinationId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [towType, setTowType] = useState<string>();
  const [dateField, setDateField] = useState<(typeof DATE_FIELDS)[number]>("plannedPickup");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TransportLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  const query = useCallback(
    () => ({
      customerId,
      carrierId,
      originId,
      destinationId,
      status,
      towType,
      search,
      dateField: range ? dateField : undefined,
      from: range?.[0]?.format("YYYY-MM-DD"),
      to: range?.[1]?.format("YYYY-MM-DD"),
    }),
    [customerId, carrierId, originId, destinationId, status, towType, search, dateField, range],
  );

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await transportApi.lines({ ...query(), page, pageSize: PAGE_SIZE });
      if (n === seq.current) {
        setRows(r.items);
        setTotal(r.total);
      }
    } catch (e) {
      if (n === seq.current) notifyError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [query, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(1);
    set(v);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      // 分页拉全量：导出的是当前筛选，不只是当前页
      const all: TransportLine[] = [];
      for (let p = 1; ; p += 1) {
        const r = await transportApi.lines({ ...query(), page: p, pageSize: 500 });
        all.push(...r.items);
        if (all.length >= r.total || !r.items.length) break;
      }
      if (!all.length) {
        message.warning(t("exportEmpty"));
        return;
      }
      writeLinesWorkbook(all, t, `transport-lines-${new Date().toISOString().slice(0, 10)}.xlsx`);
      message.success(t("exportDone", { n: all.length }));
    } catch (e) {
      notifyError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {t("linesHint")}
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          style={{ width: 130 }}
          value={dateField}
          onChange={reset(setDateField)}
          options={DATE_FIELDS.map((k) => ({ value: k, label: t(`date${k[0].toUpperCase()}${k.slice(1)}`) }))}
        />
        <DatePicker.RangePicker value={range} onChange={reset((v) => setRange((v as [Dayjs, Dayjs]) ?? null))} />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("customer")}
          style={{ width: 180 }}
          value={customerId}
          onChange={reset((v?: string) => {
            setCustomerId(v);
            setOriginId(undefined);
            setDestinationId(undefined);
          })}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("origin")}
          style={{ width: 180 }}
          value={originId}
          disabled={!customerId}
          onChange={reset(setOriginId)}
          options={places}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("destination")}
          style={{ width: 180 }}
          value={destinationId}
          disabled={!customerId}
          onChange={reset(setDestinationId)}
          options={places}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("carrier")}
          style={{ width: 160 }}
          value={carrierId}
          onChange={reset(setCarrierId)}
          options={carriers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          allowClear
          placeholder={t("towType")}
          style={{ width: 120 }}
          value={towType}
          onChange={reset(setTowType)}
          options={TOW_OPTIONS}
        />
        <Select
          allowClear
          placeholder={t("status")}
          style={{ width: 130 }}
          value={status}
          onChange={reset(setStatus)}
          options={STATUSES.map((s) => ({ value: s, label: t(`L_${s}`) }))}
        />
        <Input.Search
          allowClear
          placeholder={`VIN / ${t("orderCode")} / ${t("tripCode")}`}
          style={{ width: 220 }}
          onSearch={reset(setSearch)}
        />
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportExcel()}>
          {t("export")}
        </Button>
      </Space>
      <LineTable
        lines={rows}
        onOpenTrip={onOpenTrip}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, onChange: setPage, showSizeChanger: false }}
        extraColumns={[
          { title: t("orderCode"), dataIndex: "order_code", width: 140 },
          { title: t("customer"), dataIndex: "customer_name", width: 140 },
          {
            title: t("pickupDate"),
            dataIndex: "planned_pickup_date",
            width: 110,
            render: (v: string | null) => v ?? "-",
          },
        ]}
      />
    </>
  );
}

/** 导出列与明细表一致，财务/客户都按这张表对账 */
export function writeLinesWorkbook(lines: TransportLine[], t: TransportT, fileName: string) {
  const header = [
    t("orderCode"),
    t("requestNo"),
    t("customer"),
    t("vin"),
    t("origin"),
    t("destination"),
    t("region"),
    t("model"),
    t("color"),
    t("towType"),
    t("carrier"),
    t("tripCode"),
    t("status"),
    t("pickupDate"),
    t("deliveryDate"),
    t("pickedUpAt"),
    t("deliveredAt"),
    t("reason"),
  ];
  const body = lines.map((l) => [
    l.order_code,
    l.customer_request_no,
    l.customer_name,
    l.vin ?? "",
    [l.origin_code, l.origin_name].filter(Boolean).join(" "),
    [l.destination_code, l.destination_name].filter(Boolean).join(" "),
    l.destination_region ?? "",
    l.vehicle_model,
    l.vehicle_color,
    l.tow_type ?? "",
    l.carrier_short_name ?? l.carrier_name ?? "",
    l.trip_code ?? "",
    t(`L_${l.status}`),
    l.planned_pickup_date ?? "",
    l.planned_delivery_date ?? "",
    l.picked_up_at ? l.picked_up_at.slice(0, 19).replace("T", " ") : "",
    l.delivered_at ? l.delivered_at.slice(0, 19).replace("T", " ") : "",
    l.end_reason ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = header.map((h, i) => ({ wch: Math.max(12, i === 3 ? 20 : h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lines");
  XLSX.writeFile(wb, fileName);
}
