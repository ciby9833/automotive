"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Select, Spin, message } from "antd";
import { CheckOutlined, InboxOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuthStore } from "@/lib/auth/store";
import { Permission, usePermission } from "@/lib/auth/permissions";
import { transportApi, type DispatchGroup, type TowType } from "@/lib/api/transport";
import { DEFAULT_CAPACITY } from "./DispatchModals";
import { notifyError, useCarriers, useTransportText } from "./shared";
import s from "./dispatch.module.css";

const key = (g: DispatchGroup) => `${g.group_batch_id}|${g.dispatch_group}`;

/**
 * 第 1 步：按组确认。一组一张卡片，按导入批次分区；点卡片选中，底部浮动栏一键生成趟次。
 * 这里只定物流商（组里没填的统一选一次），司机和拖车到“指派车辆”再安排。
 */
export function GroupBoard({ internal, onConfirmed }: { internal: boolean; onConfirmed: () => void }) {
  const t = useTransportText();
  const canDispatch = usePermission(Permission.TRANSPORT_DISPATCH);
  const ownCarrierId = useAuthStore((st) => st.externalContext?.carrierId ?? null);
  const carriers = useCarriers(internal);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<DispatchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vendor, setVendor] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await transportApi.groups({ search });
      setRows(r);
      setSelected((prev) => new Set([...prev].filter((k) => r.some((g) => key(g) === k))));
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    void load();
  }, [load]);

  // 一次导入一个分区，最新的在前
  const sections = useMemo(() => {
    const map = new Map<string, DispatchGroup[]>();
    for (const g of rows) map.set(g.group_batch_id, [...(map.get(g.group_batch_id) ?? []), g]);
    return [...map.values()];
  }, [rows]);

  const chosen = rows.filter((g) => selected.has(key(g)));
  const cars = chosen.reduce((n, g) => n + g.pending_count, 0);
  // 组里没有物流商：内部人员在浮动栏里统一选一个；承运商业务员固定是自己
  const withoutVendor = chosen.filter((g) => !g.carrier_ids?.length);
  const mixed = chosen.filter((g) => (g.carrier_ids?.length ?? 0) > 1 || g.tow_types?.length !== 1);
  const ready = canDispatch && chosen.length > 0 && !mixed.length && (!withoutVendor.length || !!vendor || !!ownCarrierId);

  const toggle = (g: DispatchGroup) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key(g))) next.delete(key(g));
      else next.add(key(g));
      return next;
    });
  const toggleSection = (groups: DispatchGroup[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = groups.every((g) => next.has(key(g)));
      groups.forEach((g) => (all ? next.delete(key(g)) : next.add(key(g))));
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await transportApi.createTrips(
        chosen.map((g) => ({
          lineIds: g.pending_line_ids ?? [],
          carrierId: g.carrier_ids?.[0] ?? ownCarrierId ?? vendor!,
        })),
      );
      const failed: Record<string, string> = {};
      res.results.forEach((r) => {
        if (r.error) failed[key(chosen[r.index])] = r.error;
      });
      setErrors(failed);
      setSelected(new Set(Object.keys(failed)));
      await load();
      if (!Object.keys(failed).length) {
        message.success(t("confirmedTrips", { n: res.created }));
        setVendor(undefined);
        onConfirmed();
      } else message.warning(t("batchPartial", { ok: res.created, fail: Object.keys(failed).length }));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.board}>
      <div className={s.toolbar}>
        <div>
          <h3 className={s.title}>{t("confirmGroups")}</h3>
          <p className={s.subtitle}>{t("confirmGroupsHint")}</p>
        </div>
        <Input
          allowClear
          className={s.search}
          style={{ width: 240, flex: "none" }}
          prefix={<SearchOutlined style={{ color: "#8e8e93" }} />}
          placeholder={t("group")}
          onPressEnter={(e) => setSearch((e.target as HTMLInputElement).value)}
          onChange={(e) => !e.target.value && setSearch("")}
        />
      </div>

      <Spin spinning={loading}>
        {!rows.length && !loading && (
          <div className={s.empty}>
            <div className={s.emptyIcon}>
              <InboxOutlined />
            </div>
            {t("noGroups")}
          </div>
        )}
        {sections.map((groups) => {
          const allOn = groups.every((g) => selected.has(key(g)));
          return (
            <section key={groups[0].group_batch_id} className={s.section}>
              <div className={s.sectionHeader}>
                <div className={s.sectionTitle}>
                  {t("importedOn", { at: dayjs(groups[0].created_at).format("MM-DD HH:mm") })}
                  <span className={s.sectionMeta}>
                    {t("groupsAndCars", {
                      groups: groups.length,
                      cars: groups.reduce((n, g) => n + g.pending_count, 0),
                    })}
                  </span>
                </div>
                <button type="button" className={s.link} onClick={() => toggleSection(groups)}>
                  {allOn ? t("deselectAll") : t("selectAll")}
                </button>
              </div>
              <div className={s.grid}>
                {groups.map((g) => (
                  <GroupCard key={key(g)} g={g} on={selected.has(key(g))} error={errors[key(g)]} onToggle={() => toggle(g)} />
                ))}
              </div>
            </section>
          );
        })}
      </Spin>

      {chosen.length > 0 && (
        <div className={s.actionBar}>
          <div className={s.selection}>
            {t("selectedGroups", { n: chosen.length })}
            <span>{t("carsCount", { n: cars })}</span>
          </div>
          {mixed.length > 0 && <span className={s.danger}>{t("mixedGroup")}</span>}
          {withoutVendor.length > 0 && !ownCarrierId && (
            <div className={s.vendorPicker}>
              {t("vendorForUnassigned", { n: withoutVendor.length })}
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: 200 }}
                placeholder={t("carrier")}
                value={vendor}
                onChange={setVendor}
                options={carriers.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          )}
          <button type="button" className={s.secondary} onClick={() => setSelected(new Set())}>
            {t("cancel")}
          </button>
          <button type="button" className={s.primary} disabled={!ready || busy} onClick={() => void confirm()}>
            {busy ? "…" : t("createTrips", { n: chosen.length })}
          </button>
        </div>
      )}
    </div>
  );
}

function GroupCard({
  g,
  on,
  error,
  onToggle,
}: {
  g: DispatchGroup;
  on: boolean;
  error?: string;
  onToggle: () => void;
}) {
  const t = useTransportText();
  const towType = g.tow_types?.length === 1 ? (g.tow_types[0] as TowType) : undefined;
  const cap = towType ? DEFAULT_CAPACITY[towType] : 0;
  const pct = cap ? Math.min(100, (g.pending_count / cap) * 100) : 0;
  return (
    <div
      role="checkbox"
      aria-checked={on}
      tabIndex={0}
      className={`${s.card} ${on ? s.selected : ""}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className={s.cardTop}>
        <span className={s.groupCode}>{g.dispatch_group}</span>
        <span className={s.pill}>{g.tow_types?.join(" / ") ?? "-"}</span>
        <span className={s.check}>{on && <CheckOutlined />}</span>
      </div>
      <div className={s.capacity}>
        <div className={s.capText}>
          {g.pending_count}
          <small>{cap ? t("ofCapacity", { cap }) : t("lineCount")}</small>
        </div>
        <div className={s.bar}>
          <div className={`${s.barFill} ${pct >= 100 ? s.barFull : ""}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <dl className={s.meta}>
        <div className={s.metaRow}>
          <dt>{t("carrier")}</dt>
          <dd>{g.carrier_names ?? <span className={s.warn}>{t("notAssigned")}</span>}</dd>
        </div>
        <div className={s.metaRow}>
          <dt>{t("route")}</dt>
          <dd title={`${g.origins} → ${g.destinations}`}>
            {g.origins} → {g.destinations}
          </dd>
        </div>
        <div className={s.metaRow}>
          <dt>{t("customer")}</dt>
          <dd>{g.customers}</dd>
        </div>
        <div className={s.metaRow}>
          <dt>{t("pickupDate")}</dt>
          <dd>{g.planned_pickup_date ?? "-"}</dd>
        </div>
      </dl>
      {!!g.missing_vin_count && (
        <div className={s.chips}>
          <span className={s.chip}>{t("missingVin", { n: g.missing_vin_count })}</span>
        </div>
      )}
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}
