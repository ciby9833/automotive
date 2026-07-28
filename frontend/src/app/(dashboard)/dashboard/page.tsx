"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOutlined,
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  LoginOutlined,
  LogoutOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Button,
  Drawer,
  Empty,
  Select,
  Skeleton,
  Tooltip,
  message,
} from "antd";
import {
  dashboardApi,
  DashboardAlert,
  DashboardData,
  DashboardMetric,
  DashboardSlot,
} from "@/lib/api/dashboard";
import { useAuthStore } from "@/lib/auth/store";
import { useTranslation } from "@/i18n/useTranslation";
import styles from "./dashboard.module.css";

const STATUS_CLASS = {
  VACANT: styles.vacant,
  OCCUPIED: styles.occupied,
  LONG_STAY: styles.longStay,
  LOCKED: styles.locked,
};

function slotGroup(slot: DashboardSlot): string {
  if (slot.row) return slot.row;
  return slot.code.match(/^([A-Za-z0-9]+?)[-_ ]?\d/)?.[1]?.toUpperCase() ?? "—";
}

function MetricCard({
  label,
  metric,
  icon,
  comparison,
  suffix,
}: {
  label: string;
  metric?: DashboardMetric;
  icon: React.ReactNode;
  comparison: string;
  suffix?: string;
}) {
  if (!metric)
    return <Skeleton.Node active style={{ width: "100%", height: 118 }} />;
  const direction =
    metric.changePercent === null || metric.changePercent === 0
      ? "neutral"
      : metric.changePercent > 0
        ? "up"
        : "down";
  const ChangeIcon =
    direction === "up"
      ? ArrowUpOutlined
      : direction === "down"
        ? ArrowDownOutlined
        : null;
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricHeader}>
        <span className={styles.metricIcon}>{icon}</span>
        {label}
      </div>
      <div className={styles.metricValue}>
        {metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        {suffix}
      </div>
      <div className={`${styles.metricFoot} ${styles[direction]}`}>
        {metric.previous === null ? (
          <span>{comparison} · 暂无历史基线</span>
        ) : (
          <>
            {ChangeIcon && <ChangeIcon />}
            <span>
              {metric.changePercent === null
                ? "新增"
                : `${Math.abs(metric.changePercent)}%`}{" "}
              · {comparison}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string>();
  const [yardId, setYardId] = useState<string>();
  const [selectedSlot, setSelectedSlot] = useState<DashboardSlot | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(
    null,
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await dashboardApi.get({
          organizationId,
          yardId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setData(response);
      } catch {
        message.error(t("dashboard.loadFailed"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [organizationId, yardId, t],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, activeOrgId]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const zones = useMemo(() => {
    const map = new Map<string, DashboardSlot[]>();
    for (const slot of data?.slots ?? []) {
      const key = slotGroup(slot);
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data?.slots]);

  const selectedYard = data?.yards.find(
    (yard) => yard.id === data.selectedYardId,
  );
  const updatedAt = data?.generatedAt
    ? new Intl.DateTimeFormat(
        locale === "zh" ? "zh-CN" : locale === "id" ? "id-ID" : "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        },
      ).format(new Date(data.generatedAt))
    : "--:--:--";

  const monthComparison = t("dashboard.vsLastMonth");
  const dayComparison = t("dashboard.vsYesterday");

  return (
    <div className={styles.dashboard}>
      <div className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            {t("dashboard.liveOperations")}
          </div>
          <h1 className={styles.title}>{t("dashboard.title")}</h1>
          <div className={styles.subtitle}>
            {t("dashboard.subtitle")} · {t("dashboard.updatedAt")} {updatedAt}
          </div>
        </div>
        <div className={styles.filters}>
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder={t("dashboard.allOrganizations")}
            value={organizationId}
            options={data?.organizations.map((org) => ({
              value: org.id,
              label: `${org.code} · ${org.name}`,
            }))}
            onChange={(value) => {
              setOrganizationId(value);
              setYardId(undefined);
            }}
          />
          <Select
            allowClear
            style={{ width: 210 }}
            placeholder={t("dashboard.allYards")}
            value={yardId}
            options={data?.yards.map((yard) => ({
              value: yard.id,
              label: `${yard.code} · ${yard.name}`,
            }))}
            onChange={setYardId}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
          >
            {t("dashboard.refresh")}
          </Button>
        </div>
      </div>

      <div className={styles.metrics}>
        <MetricCard
          label={t("dashboard.metricYards")}
          metric={data?.metrics.yards}
          icon={<EnvironmentOutlined />}
          comparison={monthComparison}
        />
        <MetricCard
          label={t("dashboard.metricTotalSlots")}
          metric={data?.metrics.totalSlots}
          icon={<AppstoreOutlined />}
          comparison={monthComparison}
        />
        <MetricCard
          label={t("dashboard.metricUsedSlots")}
          metric={data?.metrics.usedSlots}
          icon={<InboxOutlined />}
          comparison={monthComparison}
        />
        <MetricCard
          label={t("dashboard.metricUtilization")}
          metric={data?.metrics.utilization}
          icon={<CheckCircleOutlined />}
          comparison={monthComparison}
          suffix="%"
        />
        <MetricCard
          label={t("dashboard.metricVehicles")}
          metric={data?.metrics.vehiclesOnSite}
          icon={<CarOutlined />}
          comparison={monthComparison}
        />
        <MetricCard
          label={t("dashboard.metricOutbound")}
          metric={data?.metrics.outboundToday}
          icon={<LogoutOutlined />}
          comparison={dayComparison}
        />
        <MetricCard
          label={t("dashboard.metricInbound")}
          metric={data?.metrics.inboundToday}
          icon={<LoginOutlined />}
          comparison={dayComparison}
        />
      </div>

      <div className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>
                {t("dashboard.slotDistribution")}
              </div>
              <div className={styles.panelMeta}>
                {selectedYard
                  ? `${selectedYard.organizationName} · ${selectedYard.name}`
                  : t("dashboard.noYard")}
              </div>
            </div>
            <div className={styles.legend}>
              {[
                ["VACANT", t("dashboard.vacant"), "#e7edf3"],
                ["OCCUPIED", t("dashboard.occupied"), "#2d72d9"],
                ["LONG_STAY", t("dashboard.longStay"), "#f0ad2f"],
                ["LOCKED", t("dashboard.locked"), "#df4955"],
              ].map(([key, label, color]) => (
                <span className={styles.legendItem} key={key}>
                  <span
                    className={styles.legendSwatch}
                    style={{ background: color }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.yardCanvas}>
            {loading && !data ? (
              <Skeleton active paragraph={{ rows: 10 }} />
            ) : zones.length === 0 ? (
              <div className={styles.empty}>
                <Empty description={t("dashboard.noSlots")} />
              </div>
            ) : (
              zones.map(([zone, slots]) => (
                <div className={styles.zone} key={zone}>
                  <div className={styles.zoneHead}>
                    <span>
                      {zone}
                      {t("dashboard.zoneSuffix")}
                    </span>
                    <span>
                      {slots.length} {t("dashboard.slotsUnit")}
                    </span>
                  </div>
                  <div className={styles.slotGrid}>
                    {slots.map((slot) => (
                      <Tooltip
                        key={slot.id}
                        title={
                          slot.currentVin
                            ? `${slot.currentVin} · ${slot.stayDays}${t("dashboard.days")}`
                            : t("dashboard.vacant")
                        }
                      >
                        <button
                          type="button"
                          className={`${styles.slot} ${STATUS_CLASS[slot.status]}`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          <span className={styles.slotCode}>{slot.code}</span>
                          <span className={styles.slotVin}>
                            {slot.currentVin ?? t("dashboard.available")}
                          </span>
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>{t("dashboard.alerts")}</div>
              <div className={styles.panelMeta}>
                {t("dashboard.alertSubtitle")}
              </div>
            </div>
            <span className={styles.panelMeta}>
              {data?.alerts.length ?? 0} {t("dashboard.items")}
            </span>
          </div>
          <div className={styles.alertList}>
            {data?.alerts.length ? (
              data.alerts.map((alert) => {
                const Icon =
                  alert.type === "LOCK_TIMEOUT"
                    ? StopOutlined
                    : alert.type === "EXPECTED_ARRIVAL"
                      ? ClockCircleOutlined
                      : alert.severity === "critical"
                        ? AlertOutlined
                        : WarningOutlined;
                return (
                  <button
                    type="button"
                    className={styles.alertItem}
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <span
                      className={`${styles.alertIcon} ${styles[alert.severity]}`}
                    >
                      <Icon />
                    </span>
                    <div>
                      <div className={styles.alertTitle}>{alert.title}</div>
                      <div className={styles.alertDetail}>{alert.detail}</div>
                      {alert.diagnostics && (
                        <div className={styles.alertInspect}>
                          {t("dashboard.viewDiagnostics")}
                        </div>
                      )}
                    </div>
                    <span className={styles.alertYard}>{alert.yardName}</span>
                  </button>
                );
              })
            ) : (
              <div className={styles.empty}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("dashboard.noAlerts")}
                />
              </div>
            )}
          </div>
        </aside>
      </div>

      <Drawer
        title={t("dashboard.slotDetail")}
        open={Boolean(selectedSlot)}
        size={380}
        onClose={() => setSelectedSlot(null)}
      >
        {selectedSlot && (
          <div className={styles.detail}>
            <div>
              <div className={styles.detailLabel}>
                {t("dashboard.slotCode")}
              </div>
              <div className={styles.detailValue}>{selectedSlot.code}</div>
            </div>
            <div>
              <div className={styles.detailLabel}>
                {t("dashboard.slotStatus")}
              </div>
              <div className={styles.detailValue}>
                {t(`dashboard.status.${selectedSlot.status}`)}
              </div>
            </div>
            <div>
              <div className={styles.detailLabel}>VIN</div>
              <div className={styles.detailValue}>
                {selectedSlot.currentVin ?? "—"}
              </div>
            </div>
            <div>
              <div className={styles.detailLabel}>
                {t("dashboard.stayDays")}
              </div>
              <div className={styles.detailValue}>
                {selectedSlot.currentVin
                  ? `${selectedSlot.stayDays} ${t("dashboard.days")}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className={styles.detailLabel}>
                {t("dashboard.assignedAt")}
              </div>
              <div className={styles.detailValue}>
                {selectedSlot.assignedAt
                  ? new Date(selectedSlot.assignedAt).toLocaleString()
                  : "—"}
              </div>
            </div>
            <div>
              <div className={styles.detailLabel}>
                {t("dashboard.lockedAt")}
              </div>
              <div className={styles.detailValue}>
                {selectedSlot.lockedAt
                  ? new Date(selectedSlot.lockedAt).toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        title={t("dashboard.alertDetail")}
        open={Boolean(selectedAlert)}
        size={720}
        onClose={() => setSelectedAlert(null)}
      >
        {selectedAlert && (
          <div className={styles.alertDiagnostic}>
            <section className={styles.diagnosticSection}>
              <div className={styles.diagnosticHeading}>
                {selectedAlert.title}
              </div>
              <div className={styles.diagnosticSummary}>
                {selectedAlert.detail}
              </div>
              <div className={styles.diagnosticMeta}>
                <span>{t("dashboard.detectedAt")}</span>
                <strong>
                  {new Date(selectedAlert.occurredAt).toLocaleString()}
                </strong>
              </div>
            </section>

            {selectedAlert.diagnostics && (
              <>
                <section className={styles.diagnosticSection}>
                  <div className={styles.diagnosticHeading}>
                    {t("dashboard.issueIdentity")}
                  </div>
                  <div className={styles.diagnosticGrid}>
                    <div>
                      <span>VIN</span>
                      <code>{selectedAlert.diagnostics.vin}</code>
                    </div>
                    <div>
                      <span>{t("dashboard.issueCodeLabel")}</span>
                      <code>{selectedAlert.diagnostics.issueCode}</code>
                    </div>
                    {selectedAlert.diagnostics.organization && (
                      <div>
                        <span>{t("dashboard.organization")}</span>
                        <strong>
                          {selectedAlert.diagnostics.organization.code} ·{" "}
                          {selectedAlert.diagnostics.organization.name}
                        </strong>
                        <code>{selectedAlert.diagnostics.organization.id}</code>
                      </div>
                    )}
                  </div>
                </section>

                <section className={styles.diagnosticSection}>
                  <div className={styles.diagnosticHeading}>
                    {t("dashboard.currentOccupiedSlots")} ·{" "}
                    {selectedAlert.diagnostics.currentSlots.length}
                  </div>
                  <div className={styles.diagnosticCards}>
                    {selectedAlert.diagnostics.currentSlots.map((slot) => (
                      <div className={styles.diagnosticCard} key={slot.slotId}>
                        <div className={styles.diagnosticCardTitle}>
                          {slot.yardCode}/{slot.slotCode}
                        </div>
                        <dl>
                          <dt>{t("dashboard.organization")}</dt>
                          <dd>
                            {slot.organizationCode} · {slot.organizationName}
                          </dd>
                          <dt>{t("dashboard.yard")}</dt>
                          <dd>
                            {slot.yardCode} · {slot.yardName}
                          </dd>
                          <dt>{t("dashboard.slotCode")}</dt>
                          <dd>{slot.slotCode}</dd>
                          <dt>{t("dashboard.assignedAt")}</dt>
                          <dd>
                            {slot.assignedAt
                              ? new Date(slot.assignedAt).toLocaleString()
                              : "—"}
                          </dd>
                          <dt>{t("dashboard.lockState")}</dt>
                          <dd>
                            {slot.isLocked
                              ? t("dashboard.yes")
                              : t("dashboard.no")}
                          </dd>
                          <dt>{t("dashboard.yardId")}</dt>
                          <dd>
                            <code>{slot.yardId}</code>
                          </dd>
                          <dt>{t("dashboard.slotId")}</dt>
                          <dd>
                            <code>{slot.slotId}</code>
                          </dd>
                        </dl>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.diagnosticSection}>
                  <div className={styles.diagnosticHeading}>
                    {t("dashboard.relatedVinRecords")} ·{" "}
                    {selectedAlert.diagnostics.relatedOrderVins.length}
                  </div>
                  {selectedAlert.diagnostics.relatedOrderVins.length ? (
                    <div className={styles.diagnosticCards}>
                      {selectedAlert.diagnostics.relatedOrderVins.map(
                        (record) => (
                          <div
                            className={styles.diagnosticCard}
                            key={record.orderVinId}
                          >
                            <div className={styles.diagnosticCardTitle}>
                              {record.orderCode}
                            </div>
                            <dl>
                              <dt>{t("dashboard.orderStatus")}</dt>
                              <dd>
                                {record.orderStatus} / {record.arrivalStatus}
                              </dd>
                              <dt>{t("dashboard.transportType")}</dt>
                              <dd>{record.transportType}</dd>
                              <dt>{t("dashboard.linkedLocation")}</dt>
                              <dd>
                                {record.linkedYardCode ?? "—"} /{" "}
                                {record.linkedSlotCode ?? "—"}
                                {record.linkedYardName
                                  ? ` · ${record.linkedYardName}`
                                  : ""}
                              </dd>
                              <dt>{t("dashboard.updatedAtLabel")}</dt>
                              <dd>
                                {new Date(record.updatedAt).toLocaleString()}
                              </dd>
                              <dt>{t("dashboard.orderId")}</dt>
                              <dd>
                                <code>{record.orderId}</code>
                              </dd>
                              <dt>{t("dashboard.orderVinId")}</dt>
                              <dd>
                                <code>{record.orderVinId}</code>
                              </dd>
                              <dt>{t("dashboard.linkedSlotId")}</dt>
                              <dd>
                                <code>{record.linkedSlotId ?? "—"}</code>
                              </dd>
                            </dl>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className={styles.diagnosticEmpty}>
                      {t("dashboard.noRelatedVinRecords")}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
