"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Input, Modal, Radio, Select, Space, Typography, message } from "antd";
import { useAuthStore } from "@/lib/auth/store";
import { carriersApi, type Driver, type Vehicle } from "@/lib/api/carriers";
import { transportApi, type TowType, type TransportLine, type TransportTrip } from "@/lib/api/transport";
import { LineTable } from "./OrdersTab";
import { TOW_OPTIONS, notifyError, useCarriers, useCustomers, useTransportText } from "./shared";

const DEFAULT_CAPACITY: Record<TowType, number> = { CC: 6, TANSYA: 4, TOWING: 1 };

interface Props {
  internal: boolean;
  onOpenTrip: (tripId: string) => void;
}

export function DispatchTab({ internal, onOpenTrip }: Props) {
  const t = useTransportText();
  const ownCarrierId = useAuthStore((s) => s.externalContext?.carrierId ?? null);
  const customers = useCustomers(internal);
  const carriers = useCarriers(internal);
  const [status, setStatus] = useState(internal ? "UNALLOCATED,ALLOCATED" : "ALLOCATED");
  const [customerId, setCustomerId] = useState<string>();
  const [carrierId, setCarrierId] = useState<string>();
  const [towType, setTowType] = useState<string>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TransportLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await transportApi.lines({ status, customerId, carrierId, towType, search, page, pageSize: 100 });
      if (n === seq.current) {
        setRows(r.items);
        setTotal(r.total);
        setSelected((keys) => keys.filter((k) => r.items.some((l) => l.id === k)));
      }
    } catch (e) {
      if (n === seq.current) notifyError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [status, customerId, carrierId, towType, search, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const chosen = useMemo(() => rows.filter((l) => selected.includes(l.id)), [rows, selected]);
  const dispatchable =
    chosen.length > 0 &&
    chosen.every((l) => l.status === "ALLOCATED") &&
    new Set(chosen.map((l) => `${l.carrier_id}|${l.tow_type}`)).size === 1;
  const allocatable = chosen.length > 0 && chosen.every((l) => ["UNALLOCATED", "ALLOCATED"].includes(l.status));

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {t("poolHint")}
      </Typography.Paragraph>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          style={{ width: 160 }}
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
          options={[
            ...(internal
              ? [
                  { value: "UNALLOCATED,ALLOCATED", label: `${t("L_UNALLOCATED")} + ${t("L_ALLOCATED")}` },
                  { value: "UNALLOCATED", label: t("L_UNALLOCATED") },
                ]
              : []),
            { value: "ALLOCATED", label: t("L_ALLOCATED") },
            { value: "DISPATCHED,PICKED_UP", label: `${t("L_DISPATCHED")} + ${t("L_PICKED_UP")}` },
          ]}
        />
        {internal && (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("customer")}
            style={{ width: 180 }}
            value={customerId}
            onChange={(v) => {
              setPage(1);
              setCustomerId(v);
            }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        {internal && (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("carrier")}
            style={{ width: 180 }}
            value={carrierId}
            onChange={(v) => {
              setPage(1);
              setCarrierId(v);
            }}
            options={carriers.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <Select
          allowClear
          placeholder={t("towType")}
          style={{ width: 130 }}
          value={towType}
          onChange={(v) => {
            setPage(1);
            setTowType(v);
          }}
          options={TOW_OPTIONS}
        />
        <Input.Search
          allowClear
          placeholder={`VIN / ${t("orderCode")}`}
          style={{ width: 220 }}
          onSearch={(v) => {
            setPage(1);
            setSearch(v);
          }}
        />
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <Typography.Text>{t("selected", { n: selected.length })}</Typography.Text>
        {internal && (
          <Button disabled={!allocatable} onClick={() => setAllocateOpen(true)}>
            {t("allocate")}
          </Button>
        )}
        <Button type="primary" disabled={!dispatchable} onClick={() => setTripOpen(true)}>
          {t("createTrip")}
        </Button>
        {chosen.length > 0 && !dispatchable && chosen.every((l) => l.status === "ALLOCATED") && (
          <Typography.Text type="warning">{t("sameCarrier")}</Typography.Text>
        )}
      </Space>
      <LineTable
        lines={rows}
        onOpenTrip={onOpenTrip}
        selection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (l) => ({ disabled: !["UNALLOCATED", "ALLOCATED"].includes(l.status) }),
        }}
        extraColumns={[
          { title: t("orderCode"), dataIndex: "order_code", width: 140 },
          { title: t("customer"), dataIndex: "customer_name", width: 140 },
          { title: t("pickupDate"), dataIndex: "planned_pickup_date", width: 110, render: (v: string | null) => v ?? "-" },
        ]}
      />
      {total > rows.length && (
        <Space style={{ marginTop: 8 }}>
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            ‹
          </Button>
          <span>
            {page} / {Math.ceil(total / 100)}
          </span>
          <Button disabled={page * 100 >= total} onClick={() => setPage(page + 1)}>
            ›
          </Button>
        </Space>
      )}
      {allocateOpen && (
        <AllocateModal
          lineIds={selected}
          carriers={carriers.map((c) => ({ value: c.id, label: c.name }))}
          defaultTowType={chosen.find((l) => l.tow_type)?.tow_type ?? undefined}
          onClose={() => setAllocateOpen(false)}
          onDone={() => {
            setAllocateOpen(false);
            setSelected([]);
            void load();
          }}
        />
      )}
      {tripOpen && chosen[0] && (
        <TripModal
          lines={chosen}
          carrierId={chosen[0].carrier_id ?? ownCarrierId ?? ""}
          towType={chosen[0].tow_type!}
          onClose={() => setTripOpen(false)}
          onDone={(tripId) => {
            setTripOpen(false);
            setSelected([]);
            void load();
            onOpenTrip(tripId);
          }}
        />
      )}
    </>
  );
}

function AllocateModal({
  lineIds,
  carriers,
  defaultTowType,
  onClose,
  onDone,
}: {
  lineIds: string[];
  carriers: { value: string; label: string }[];
  defaultTowType?: TowType;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTransportText();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={`${t("allocate")} · ${t("selected", { n: lineIds.length })}`}
      onCancel={onClose}
      confirmLoading={busy}
      onOk={async () => {
        const v = (await form.validateFields()) as { carrierId: string; towType: TowType };
        setBusy(true);
        try {
          await transportApi.allocate(lineIds, v.carrierId, v.towType);
          message.success(t("saved"));
          onDone();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ towType: defaultTowType }}>
        <Form.Item name="carrierId" label={t("carrier")} rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={carriers} />
        </Form.Item>
        <Form.Item name="towType" label={t("towType")} rules={[{ required: true }]}>
          <Radio.Group options={TOW_OPTIONS} optionType="button" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function TripModal({
  lines,
  carrierId,
  towType,
  onClose,
  onDone,
}: {
  lines: TransportLine[];
  carrierId: string;
  towType: TowType;
  onClose: () => void;
  onDone: (tripId: string) => void;
}) {
  const t = useTransportText();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [openTrips, setOpenTrips] = useState<TransportTrip[]>([]);
  const [driverId, setDriverId] = useState<string>();
  const [vehicleId, setVehicleId] = useState<string>();
  const [tripId, setTripId] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      carriersApi.listDrivers(carrierId),
      carriersApi.listVehicles(carrierId),
      transportApi.trips({ status: "PLANNED,LOADING", pageSize: 200 }),
    ])
      .then(([d, v, trips]) => {
        setDrivers(d);
        setVehicles(v.filter((x) => x.towType === towType));
        setOpenTrips(trips.items.filter((x) => x.carrier_id === carrierId && x.tow_type === towType));
      })
      .catch(notifyError);
  }, [carrierId, towType]);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const capacity = vehicle ? (vehicle.capacity ?? DEFAULT_CAPACITY[towType]) : null;
  const target = openTrips.find((x) => x.id === tripId);
  const room = target ? target.capacity - (target.line_count ?? 0) : null;
  const over = mode === "new" ? capacity !== null && lines.length > capacity : room !== null && lines.length > room;

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "new") {
        const trip = await transportApi.createTrip({ carrierId, driverId: driverId!, vehicleId: vehicleId!, lineIds: lines.map((l) => l.id) });
        message.success(t("saved"));
        onDone(trip.id);
      } else {
        await transportApi.addTripLines(tripId!, lines.map((l) => l.id));
        message.success(t("saved"));
        onDone(tripId!);
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`${t("createTrip")} · ${lines[0].carrier_name ?? ""} · ${towType} · ${t("selected", { n: lines.length })}`}
      onCancel={onClose}
      confirmLoading={busy}
      okButtonProps={{ disabled: over || (mode === "new" ? !driverId || !vehicleId : !tripId) }}
      onOk={submit}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          options={[
            { value: "new", label: t("createTrip") },
            { value: "existing", label: t("addToTrip"), disabled: !openTrips.length },
          ]}
          optionType="button"
        />
        {mode === "new" ? (
          <>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t("driver")}
              value={driverId}
              onChange={setDriverId}
              options={drivers.map((d) => ({ value: d.id, label: d.phone ? `${d.name} · ${d.phone}` : d.name }))}
            />
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t("trailer")}
              value={vehicleId}
              onChange={setVehicleId}
              options={vehicles.map((v) => ({
                value: v.id,
                label: `${v.plateNumber} · ${t("capacityLeft", { cap: v.capacity ?? DEFAULT_CAPACITY[towType] })}`,
              }))}
            />
          </>
        ) : (
          <Select
            placeholder={t("openTrip")}
            value={tripId}
            onChange={setTripId}
            options={openTrips.map((x) => ({
              value: x.id,
              label: `${x.code} · ${x.plate_number} · ${x.driver_name} · ${x.line_count ?? 0}/${x.capacity}`,
            }))}
          />
        )}
        {over && (
          <Alert type="error" showIcon message={t("overCapacity", { cap: mode === "new" ? (capacity ?? 0) : (target?.capacity ?? 0) })} />
        )}
      </Space>
    </Modal>
  );
}
