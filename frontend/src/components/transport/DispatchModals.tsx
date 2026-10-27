"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Input, Modal, Select, Space, message } from "antd";
import { carriersApi, type Driver, type Vehicle } from "@/lib/api/carriers";
import { transportApi, type TowType, type TransportTrip } from "@/lib/api/transport";
import { notifyError, useTransportText } from "./shared";

// 默认载量统一从 lib/fleet/towTypes 取，这里只是转出，方便调度相关组件引用
export { DEFAULT_CAPACITY } from "@/lib/fleet/towTypes";
import { DEFAULT_CAPACITY } from "@/lib/fleet/towTypes";

type Fleet = { drivers: Driver[]; vehicles: Vehicle[] };

/** 按物流商取司机和拖车（只取启用的），同一个弹窗里多行共用 */
export function useFleets(carrierIds: string[]) {
  const [fleets, setFleets] = useState<Record<string, Fleet>>({});
  const key = [...new Set(carrierIds.filter(Boolean))].sort().join(",");
  useEffect(() => {
    const missing = key.split(",").filter((id) => id && !fleets[id]);
    if (!missing.length) return;
    Promise.all(
      missing.map((id) =>
        Promise.all([carriersApi.listDrivers(id), carriersApi.listVehicles(id)]).then(
          ([drivers, vehicles]) => [id, { drivers, vehicles }] as const,
        ),
      ),
    )
      .then((rows) => setFleets((f) => ({ ...f, ...Object.fromEntries(rows) })))
      .catch(notifyError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return fleets;
}

/** 装着未签收车的趟次，用来提示“这辆拖车还在跑”（只提示，装车时才拦） */
export function useBusyTrailers() {
  const [trips, setTrips] = useState<TransportTrip[]>([]);
  useEffect(() => {
    transportApi
      .trips({ status: "PLANNED,LOADING,IN_TRANSIT", pageSize: 200 })
      .then((r) => setTrips(r.items))
      .catch(notifyError);
  }, []);
  return (vehicleId?: string) =>
    vehicleId
      ? trips.filter((x) => x.vehicle_id === vehicleId && (x.loaded_count ?? 0) > (x.delivered_count ?? 0))
      : [];
}

function vehicleOptions(vehicles: Vehicle[], towType: TowType | undefined, t: ReturnType<typeof useTransportText>) {
  return vehicles
    .filter((v) => !towType || v.towType === towType)
    .map((v) => ({
      value: v.id,
      label: `${v.plateNumber} · ${t("capacityLeft", { cap: v.capacity ?? DEFAULT_CAPACITY[v.towType as TowType] ?? "-" })}`,
    }));
}

const driverOptions = (drivers: Driver[]) =>
  drivers.map((d) => ({ value: d.id, label: d.phone ? `${d.name} · ${d.phone}` : d.name }));


/**
 * 更换（提货前）/ 更正（提货后，内部）这趟车的物流商、司机、拖车。
 * 拖车只列与本趟同类型的；更正必须写原因，并会重算本趟未确认的应付。
 */
export function CarrierChangeModal({
  trip,
  mode,
  carriers,
  ownCarrierId,
  onClose,
  onDone,
}: {
  trip: TransportTrip;
  /** assign：首次指派司机和拖车（物流商不变）；reassign：提货前更换；correct：提货后内部更正 */
  mode: "assign" | "reassign" | "correct";
  carriers: { value: string; label: string }[];
  ownCarrierId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTransportText();
  const [carrierId, setCarrierId] = useState<string>(ownCarrierId ?? trip.carrier_id);
  const [driverId, setDriverId] = useState<string>();
  const [vehicleId, setVehicleId] = useState<string>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const fleets = useFleets([carrierId]);
  const fleet = fleets[carrierId];
  const options = useMemo(() => vehicleOptions(fleet?.vehicles ?? [], trip.tow_type, t), [fleet, trip.tow_type, t]);
  const needReason = mode === "correct";

  return (
    <Modal
      open
      title={`${mode === "correct" ? t("correctCarrier") : mode === "assign" ? t("assignVehicles") : t("changeCarrier")} · ${trip.code}`}
      onCancel={onClose}
      confirmLoading={busy}
      okButtonProps={{ disabled: !driverId || !vehicleId || (needReason && !reason.trim()) }}
      onOk={async () => {
        setBusy(true);
        try {
          const body = { carrierId, driverId: driverId!, vehicleId: vehicleId!, reason: reason.trim() };
          if (mode === "correct") {
            const r = await transportApi.correctCarrier(trip.id, body);
            message.success(t("corrected", { n: r.repriced }));
          } else {
            await transportApi.reassignTrip(trip.id, body);
            message.success(t("saved"));
          }
          onDone();
        } catch (e) {
          notifyError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Alert
          type={mode === "correct" ? "warning" : "info"}
          showIcon
          message={
            mode === "correct" ? t("correctCarrierHint") : mode === "assign" ? t("assignVehiclesHint") : t("changeCarrierHint")
          }
        />
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: "100%" }}
          value={carrierId}
          disabled={!!ownCarrierId || mode === "assign"}
          options={carriers}
          onChange={(v) => {
            setCarrierId(v);
            setDriverId(undefined);
            setVehicleId(undefined);
          }}
        />
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={t("driver")}
          style={{ width: "100%" }}
          value={driverId}
          options={driverOptions(fleet?.drivers ?? [])}
          onChange={setDriverId}
        />
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={`${t("trailer")} · ${trip.tow_type}`}
          style={{ width: "100%" }}
          value={vehicleId}
          options={options}
          onChange={setVehicleId}
        />
        <Input.TextArea
          rows={2}
          maxLength={1000}
          placeholder={needReason ? t("reasonRequired") : `${t("reason")}（${t("remark")}）`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Space>
    </Modal>
  );
}
