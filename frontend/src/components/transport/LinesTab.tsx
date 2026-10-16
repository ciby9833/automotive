"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, DatePicker, Input, Modal, Select, Space, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useTranslation } from "@/i18n/useTranslation";
import { AttachmentFiles } from "@/components/evidence/SignedAttachments";
import { transportApi, type TransportLine } from "@/lib/api/transport";
import { LineTable } from "./OrdersTab";
import {
  TOW_OPTIONS,
  addressOptions,
  fmtTime,
  notifyError,
  useCarriers,
  useCustomerAddresses,
  useCustomers,
  useTransportText,
} from "./shared";

const PAGE_SIZE = 100;
const DATE_FIELDS = ["orderCreated", "plannedPickup", "plannedDelivery", "pickedUp", "delivered"] as const;
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
  const { locale } = useTranslation();
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
  // 默认只看最近 30 天的需求单，避免一打开就扫全量；清空日期即可看全部
  const [dateField, setDateField] = useState<(typeof DATE_FIELDS)[number]>("orderCreated");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => [dayjs().subtract(29, "day"), dayjs()]);
  const [photosOf, setPhotosOf] = useState<TransportLine | null>(null);
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
      const r = await transportApi.lines({ ...query(), timeline: "true", page, pageSize: PAGE_SIZE });
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
      // 后端按当前筛选生成，签收照片嵌缩略图；超过 1000 台会提示缩小范围
      await transportApi.exportLines(query(), locale);
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
        loading={loading}
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
          {
            title: t("delivered"),
            width: 150,
            render: (_: unknown, l: TransportLine) =>
              l.delivered_at ? (
                <Space direction="vertical" size={0}>
                  <span>{fmtTime(l.delivered_at)}</span>
                  {(l.delivery_photos.length > 0 || !!l.pod_documents?.length) && (
                    <a onClick={() => setPhotosOf(l)}>
                      {t("photoCount", { n: l.delivery_photos.length + (l.pod_documents?.length ?? 0) })}
                    </a>
                  )}
                </Space>
              ) : (
                "-"
              ),
          },
        ]}
      />
      {/* 照片点开才加载，列表本身不拉图片 */}
      {photosOf && (
        <Modal
          open
          footer={null}
          width={720}
          title={`${photosOf.vin ?? ""} · ${t("deliveryProof")}`}
          onCancel={() => setPhotosOf(null)}
        >
          {/* 签收照片和回单里的图片在同一个预览组里，点开可以左右切换；PDF 在新标签页打开 */}
          <AttachmentFiles
            files={[
              ...photosOf.delivery_photos.map((key) => ({ key })),
              ...(photosOf.pod_documents ?? []).map((d) => ({ key: d.key, name: d.name, mime: d.mime })),
            ]}
          />
        </Modal>
      )}
    </>
  );
}
