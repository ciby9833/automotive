"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Select, Spin, message } from "antd";
import { CarOutlined, SearchOutlined } from "@ant-design/icons";
import { Permission, usePermission } from "@/lib/auth/permissions";
import { transportApi, type TransportTrip } from "@/lib/api/transport";
import { DEFAULT_CAPACITY, useBusyTrailers, useFleets } from "./DispatchModals";
import { notifyError, useTransportText } from "./shared";
import s from "./dispatch.module.css";

type Choice = { driverId?: string; vehicleId?: string };

/**
 * 第 2 步：指派车辆。已确认的趟次按物流商分组列出，每趟在行内选司机和拖车。
 * 现在多由 J&T 代物流商指派；物流商业务员登录后只看到自己的趟次，同样在这里指派。
 */
export function AssignBoard({ onOpenTrip }: { onOpenTrip: (tripId: string) => void }) {
  const t = useTransportText();
  const canDispatch = usePermission(Permission.TRANSPORT_DISPATCH);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<TransportTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const fleets = useFleets(rows.map((r) => r.carrier_id));
  const busyTrips = useBusyTrailers();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await transportApi.trips({ unassigned: "true", search, pageSize: 200 })).items);
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => {
    const map = new Map<string, TransportTrip[]>();
    for (const r of rows) map.set(r.carrier_id, [...(map.get(r.carrier_id) ?? []), r]);
    return [...map.values()];
  }, [rows]);

  const assign = async (trip: TransportTrip) => {
    const p = picks[trip.id];
    setSaving(trip.id);
    try {
      await transportApi.reassignTrip(trip.id, {
        carrierId: trip.carrier_id,
        driverId: p.driverId!,
        vehicleId: p.vehicleId!,
      });
      message.success(t("assignedOk", { code: trip.code }));
      setRows((list) => list.filter((x) => x.id !== trip.id));
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={s.board}>
      <div className={s.toolbar}>
        <div>
          <h3 className={s.title}>{t("assignVehicles")}</h3>
          <p className={s.subtitle}>{t("assignVehiclesHint")}</p>
        </div>
        <Input
          allowClear
          className={s.search}
          style={{ width: 240, flex: "none" }}
          prefix={<SearchOutlined style={{ color: "#8e8e93" }} />}
          placeholder={`${t("tripCode")} / VIN`}
          onPressEnter={(e) => setSearch((e.target as HTMLInputElement).value)}
          onChange={(e) => !e.target.value && setSearch("")}
        />
      </div>
      <Spin spinning={loading}>
        {!rows.length && !loading && (
          <div className={s.empty}>
            <div className={s.emptyIcon}>
              <CarOutlined />
            </div>
            {t("allAssigned")}
          </div>
        )}
        {sections.map((trips) => (
          <section key={trips[0].carrier_id} className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionTitle}>
                {trips[0].carrier_name}
                <span className={s.sectionMeta}>{t("tripsCount", { n: trips.length })}</span>
              </div>
            </div>
            <div className={s.list}>
              {trips.map((trip) => {
                const p = picks[trip.id] ?? {};
                const fleet = fleets[trip.carrier_id];
                const vehicles = (fleet?.vehicles ?? []).filter((v) => v.towType === trip.tow_type);
                const busy = busyTrips(p.vehicleId);
                const vehicle = vehicles.find((v) => v.id === p.vehicleId);
                const cap = vehicle ? (vehicle.capacity ?? DEFAULT_CAPACITY[trip.tow_type]) : null;
                const over = cap !== null && (trip.line_count ?? 0) > cap;
                return (
                  <div key={trip.id} className={s.row}>
                    <div style={{ minWidth: 0 }}>
                      <div className={s.rowTitle}>
                        <a onClick={() => onOpenTrip(trip.id)}>{trip.code}</a>
                        <span className={s.pill}>{trip.tow_type}</span>
                        {trip.dispatch_groups && <span className={s.pill}>{trip.dispatch_groups}</span>}
                      </div>
                      <div className={s.rowSub}>
                        {t("carsCount", { n: trip.line_count ?? 0 })} · {trip.origins} → {trip.destinations}
                        {trip.customers ? ` · ${trip.customers}` : ""}
                      </div>
                    </div>
                    <div className={s.rowActions}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        variant="filled"
                        style={{ width: 180 }}
                        placeholder={t("driver")}
                        value={p.driverId}
                        options={(fleet?.drivers ?? []).map((d) => ({
                          value: d.id,
                          label: d.phone ? `${d.name} · ${d.phone}` : d.name,
                        }))}
                        onChange={(v) => setPicks((x) => ({ ...x, [trip.id]: { ...p, driverId: v } }))}
                      />
                      <Select
                        showSearch
                        optionFilterProp="label"
                        variant="filled"
                        style={{ width: 190 }}
                        placeholder={`${t("trailer")} · ${trip.tow_type}`}
                        value={p.vehicleId}
                        options={vehicles.map((v) => ({
                          value: v.id,
                          label: `${v.plateNumber} · ${t("capacityLeft", { cap: v.capacity ?? DEFAULT_CAPACITY[trip.tow_type] })}`,
                        }))}
                        onChange={(v) => setPicks((x) => ({ ...x, [trip.id]: { ...p, vehicleId: v } }))}
                      />
                      <button
                        type="button"
                        className={`${s.primary} ${s.small}`}
                        disabled={!canDispatch || !p.driverId || !p.vehicleId || over || saving === trip.id}
                        onClick={() => void assign(trip)}
                      >
                        {t("assign")}
                      </button>
                    </div>
                    {(busy.length > 0 || over) && (
                      <div className={`${s.rowNote} ${over ? s.danger : s.warn}`}>
                        {over
                          ? t("overCapacity", { cap: cap ?? 0 })
                          : t("trailerBusy", { trips: busy.map((x) => x.code).join("、") })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </Spin>
    </div>
  );
}
