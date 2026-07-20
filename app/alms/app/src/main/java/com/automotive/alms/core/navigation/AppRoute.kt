package com.automotive.alms.core.navigation

sealed class AppRoute(val path: String) {
    data object Login : AppRoute("login")
    data object OrgSelect : AppRoute("org-select")
    data object Home : AppRoute("home")
    data object InboundScan : AppRoute("inbound-scan")
    data object PickupScan : AppRoute("pickup-scan")
    data object WaybillList : AppRoute("waybills")
    data object YardInventory : AppRoute("yard-inventory")
    data object OutboundOrders : AppRoute("outbound-orders")
}
