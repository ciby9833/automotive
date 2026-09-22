"use client";

import { useState } from "react";
import { Card, Tabs } from "antd";
import { useAuthStore } from "@/lib/auth/store";
import { Role } from "@/lib/auth/role";
import { Permission, usePermission } from '@/lib/auth/permissions';
import { ChargesTab, TariffsTab } from "@/components/transport/FinanceTabs";
import { TripDrawer } from "@/components/transport/TripsTab";
import { useTransportText } from "@/components/transport/shared";

export default function TransportFinancePage() {
  const org = useAuthStore((s) => s.activeOrgId);
  const role = useAuthStore((s) => s.user?.role);
  return <TransportFinanceWorkspace key={`${org}-${role}`} role={role} />;
}

/** 纯运输的报价与费用；业务操作在「纯运输」菜单，这里只做结算口径。 */
function TransportFinanceWorkspace({ role }: { role?: string }) {
  const t = useTransportText();
  const canDispatch = usePermission(Permission.TRANSPORT_DISPATCH);
  const internal = role === Role.HQ_ADMIN || role === Role.ORG_ADMIN;
  const [tripId, setTripId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState("charges");

  if (!internal) return null;

  return (
    <Card variant="borderless" styles={{ body: { paddingTop: 4 } }}>
      <Tabs
        activeKey={active}
        onChange={setActive}
        destroyOnHidden
        items={[
          { key: "charges", label: t("tabCharges"), children: <ChargesTab key={version} onOpenTrip={setTripId} /> },
          { key: "tariffs", label: t("tabTariffs"), children: <TariffsTab /> },
        ]}
      />
      {tripId && (
        <TripDrawer
          tripId={tripId}
          internal={internal}
          canManage={canDispatch}
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
