"use client";

import { useEffect, useState } from "react";
import { Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "@/i18n/useTranslation";
import {
  customersApi,
  type Customer,
  type CustomerAddress,
} from "@/lib/api/customers";
import { carriersApi, type Carrier } from "@/lib/api/carriers";
import type { LineStatus, TripStatus } from "@/lib/api/transport";
import { transportText, type TransportT } from "./copy";

export function useTransportText(): TransportT {
  const { locale } = useTranslation();
  return transportText(locale);
}

export function errorText(e: unknown): string {
  const x = e as {
    message?: string;
    response?: { data?: { message?: string | string[] } };
  };
  const v = x.response?.data?.message || x.message || "Request failed";
  return Array.isArray(v) ? v.join("; ") : v;
}

export function notifyError(e: unknown) {
  message.error(errorText(e));
}

const LINE_COLORS: Record<LineStatus, string> = {
  UNALLOCATED: "orange",
  ALLOCATED: "gold",
  DISPATCHED: "blue",
  PICKED_UP: "cyan",
  IN_TRANSIT: "geekblue",
  DELIVERED: "green",
  CLOSED: "default",
  CANCELLED: "default",
};
const TRIP_COLORS: Record<TripStatus, string> = {
  PLANNED: "gold",
  LOADING: "blue",
  IN_TRANSIT: "geekblue",
  COMPLETED: "green",
  CANCELLED: "default",
};

export function LineStatusTag({ status }: { status: LineStatus }) {
  const t = useTransportText();
  return <Tag color={LINE_COLORS[status]}>{t(`L_${status}`)}</Tag>;
}

export function TripStatusTag({ status }: { status: TripStatus }) {
  const t = useTransportText();
  return <Tag color={TRIP_COLORS[status]}>{t(`T_${status}`)}</Tag>;
}

export function OrderStatusTag({ status }: { status: string }) {
  const t = useTransportText();
  const color =
    status === "OPEN" ? "blue" : status === "COMPLETED" ? "green" : "default";
  return <Tag color={color}>{t(`O_${status}`)}</Tag>;
}

export function Place({
  code,
  name,
}: {
  code: string | null | undefined;
  name: string | null | undefined;
}) {
  return (
    <span>
      {name ?? "-"}
      {code ? (
        <Typography.Text
          type="secondary"
          style={{ marginLeft: 4, fontSize: 12 }}
        >
          {code}
        </Typography.Text>
      ) : null}
    </span>
  );
}

export function Vin({ vin }: { vin: string | null }) {
  const t = useTransportText();
  return vin ? (
    <Typography.Text
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      {vin}
    </Typography.Text>
  ) : (
    <Typography.Text type="warning">{t("noVin")}</Typography.Text>
  );
}

export const fmtTime = (v: string | null | undefined) =>
  v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-";

export function fmtMoney(amount: string | number, currency: string) {
  const digits = currency === "IDR" || currency === "VND" ? 0 : 2;
  return `${Number(amount).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
}

/** 客户列表（启用中），内部账号才能拉取 */
export function useCustomers(enabled: boolean) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    if (!enabled) return;
    customersApi
      .list()
      .then((rows) => setCustomers(rows.filter((c) => c.status === "ACTIVE")))
      .catch(notifyError);
  }, [enabled]);
  return customers;
}

export function useCarriers(enabled: boolean) {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  useEffect(() => {
    if (!enabled) return;
    carriersApi
      .list()
      .then((rows) => setCarriers(rows.filter((c) => c.status === "ACTIVE")))
      .catch(notifyError);
  }, [enabled]);
  return carriers;
}

/** Page-local addresses: never reuse customer data across login/organization sessions. */
export function useCustomerAddresses(customerId: string | undefined) {
  const [result, setResult] = useState<{
    customerId: string;
    rows: CustomerAddress[];
  } | null>(null);
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    customersApi
      .get(customerId)
      .then((detail) => {
        if (!cancelled)
          setResult({
            customerId,
            rows: (detail.addresses ?? []).filter((a) => a.isActive),
          });
      })
      .catch((error) => {
        if (!cancelled) notifyError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);
  return result?.customerId === customerId ? (result?.rows ?? []) : [];
}

export function addressOptions(
  addresses: CustomerAddress[],
  t: TransportT,
  kinds?: string[],
) {
  const kindLabel: Record<string, string> = {
    STORE: t("destinationStore"),
    FACTORY: "Factory",
    YARD: "Yard",
  };
  return addresses
    .filter((a) => !kinds || kinds.includes(a.kind ?? "STORE"))
    .map((a) => ({
      value: a.id,
      label: `${a.code ? `${a.code} · ` : ""}${a.dealerName}${a.kind && a.kind !== "STORE" ? ` (${kindLabel[a.kind]})` : ""}`,
    }));
}

export const TOW_OPTIONS = [
  { value: "CC", label: "CC · 6" },
  { value: "TANSYA", label: "TANSYA · 4" },
  { value: "TOWING", label: "TOWING · 1" },
];
