"use client";

import { useState } from "react";
import { Card, Tabs } from "antd";
import { useAuthStore } from "@/lib/auth/store";
import { Role } from "@/lib/auth/role";
import { OrdersTab } from "@/components/transport/OrdersTab";
import { DispatchTab } from "@/components/transport/DispatchTab";
import { TripDrawer, TripsTab } from "@/components/transport/TripsTab";
import { ExceptionsTab } from "@/components/transport/ExceptionsTab";
import { useTransportText } from "@/components/transport/shared";

export default function TransportPage() {
  const org = useAuthStore((s) => s.activeOrgId);
  const role = useAuthStore((s) => s.user?.role);
  return <TransportWorkspace key={`${org}-${role}`} role={role} />;
}

/**
 * 纯 A→B 运输业务：一台车一行明细，按台分配物流商与拖车类型，趟次可跨发货地、跨门店、跨客户。
 * 各角色只看到自己需要的页签：内部需求单+调度+趟次+异常；承运商业务员调度+趟次；司机趟次；客户需求单。
 * 报价与费用属于结算口径，放在「财务结算 → 运输财务」。
 */
function TransportWorkspace({ role }: { role?: string }) {
  const t = useTransportText();
  const internal = role === Role.HQ_ADMIN || role === Role.ORG_ADMIN;
  const carrierStaff = role === Role.CARRIER_STAFF;
  const driver = role === Role.CARRIER_DRIVER;
  const customer = role === Role.CUSTOMER;
  const canManage = internal || carrierStaff;
  const [tripId, setTripId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState(internal || customer ? "orders" : carrierStaff ? "dispatch" : "trips");

  const tabs = [
    (internal || customer) && {
      key: "orders",
      label: t("tabOrders"),
      children: <OrdersTab key={version} internal={internal} onOpenTrip={setTripId} />,
    },
    canManage && {
      key: "dispatch",
      label: t("tabDispatch"),
      children: <DispatchTab key={version} internal={internal} onOpenTrip={setTripId} />,
    },
    (canManage || driver) && {
      key: "trips",
      label: t("tabTrips"),
      children: <TripsTab key={version} internal={internal} canManage={canManage} onOpenTrip={setTripId} />,
    },
    internal && {
      key: "exceptions",
      label: t("tabExceptions"),
      children: <ExceptionsTab key={version} onOpenTrip={setTripId} />,
    },
  ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[];

  return (
    <Card variant="borderless" styles={{ body: { paddingTop: 4 } }}>
      <Tabs activeKey={active} onChange={setActive} items={tabs} destroyOnHidden />
      {tripId && (
        <TripDrawer
          tripId={tripId}
          internal={internal}
          canManage={canManage}
          onClose={() => {
            setTripId(null);
            setVersion((v) => v + 1);
          }}
          onChanged={() => undefined}
        />
      )}
    </Card>
  );
}
