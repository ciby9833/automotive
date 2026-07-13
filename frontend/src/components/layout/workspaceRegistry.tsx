'use client';

import type { ComponentType } from 'react';
import DashboardPage from '@/app/(dashboard)/dashboard/page';
import InboundImportPage from '@/app/(dashboard)/inbound/import/page';
import InboundOrdersPage from '@/app/(dashboard)/inbound/orders/page';
import InboundScanPage from '@/app/(dashboard)/inbound/scan/page';
import OutboundImportPage from '@/app/(dashboard)/outbound/import/page';
import OutboundOrdersPage from '@/app/(dashboard)/outbound/orders/page';
import OutboundPlanPage from '@/app/(dashboard)/outbound/plan/page';
import OutboundDeparturePage from '@/app/(dashboard)/outbound/departure/page';
import DeliverySignPage from '@/app/(dashboard)/delivery/sign/page';
import { OutboundOrderDetail } from '@/app/(dashboard)/outbound/orders/[id]/page';
import WaybillsPage from '@/app/(dashboard)/waybills/page';
import YardBoardPage from '@/app/(dashboard)/yards/page';
import VinInventoryPage from '@/app/(dashboard)/vin-inventory/page';
import TrackingPage from '@/app/(dashboard)/tracking/page';
import FinancePage from '@/app/(dashboard)/finance/page';
import CustomersPage from '@/app/(dashboard)/customers/page';
import CarriersPage from '@/app/(dashboard)/carriers/page';
import YardSetupPage from '@/app/(dashboard)/settings/yards/page';
import SlotSetupPage from '@/app/(dashboard)/settings/slots/page';
import UsersPage from '@/app/(dashboard)/users/page';
import PickupScanPage from '@/app/(dashboard)/pickup/page';
import { InboundOrderDetail } from '@/app/(dashboard)/inbound/orders/[id]/page';
import type { WorkspaceTab } from './layoutStore';

const WORKSPACE_PAGE_REGISTRY: Record<string, ComponentType> = {
  '/dashboard': DashboardPage,
  '/inbound/import': InboundImportPage,
  '/inbound/orders': InboundOrdersPage,
  '/inbound/scan': InboundScanPage,
  '/outbound/import': OutboundImportPage,
  '/outbound/orders': OutboundOrdersPage,
  '/outbound/plan': OutboundPlanPage,
  '/outbound/departure': OutboundDeparturePage,
  '/delivery/sign': DeliverySignPage,
  '/waybills': WaybillsPage,
  '/yards': YardBoardPage,
  '/vin-inventory': VinInventoryPage,
  '/tracking': TrackingPage,
  '/finance': FinancePage,
  '/customers': CustomersPage,
  '/carriers': CarriersPage,
  '/settings/yards': YardSetupPage,
  '/settings/slots': SlotSetupPage,
  '/users': UsersPage,
  '/pickup': PickupScanPage,
};

export function renderWorkspacePage(tab: WorkspaceTab) {
  const StaticPage = WORKSPACE_PAGE_REGISTRY[tab.path];
  if (StaticPage) return <StaticPage />;

  if (tab.key === 'inbound-order-detail' && tab.params?.id) {
    return <InboundOrderDetail id={tab.params.id} />;
  }
  if (tab.key === 'outbound-order-detail' && tab.params?.id) {
    return <OutboundOrderDetail id={tab.params.id} />;
  }

  return null;
}
