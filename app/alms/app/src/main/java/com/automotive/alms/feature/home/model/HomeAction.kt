package com.automotive.alms.feature.home.model

import androidx.annotation.StringRes
import com.automotive.alms.R
import com.automotive.alms.core.model.Permission
import com.automotive.alms.core.navigation.AppRoute

data class HomeAction(
    @StringRes val titleRes: Int,
    @StringRes val subtitleRes: Int,
    val route: AppRoute,
    val requiredPermission: String,
)

object HomeActions {
    val all = listOf(
        HomeAction(
            titleRes = R.string.inbound_scan,
            subtitleRes = R.string.inbound_scan_subtitle,
            route = AppRoute.InboundScan,
            requiredPermission = Permission.INBOUND_SCAN,
        ),
        HomeAction(
            titleRes = R.string.pickup_scan,
            subtitleRes = R.string.pickup_scan_subtitle,
            route = AppRoute.PickupScan,
            requiredPermission = Permission.PICKUP_SCAN,
        ),
        HomeAction(
            titleRes = R.string.waybills,
            subtitleRes = R.string.waybills_subtitle,
            route = AppRoute.WaybillList,
            requiredPermission = Permission.WAYBILL_VIEW,
        ),
        HomeAction(
            titleRes = R.string.vin_inventory,
            subtitleRes = R.string.vin_inventory_subtitle,
            route = AppRoute.YardInventory,
            requiredPermission = Permission.YARD_VIEW_VIN_INVENTORY,
        ),
        HomeAction(
            titleRes = R.string.outbound_orders,
            subtitleRes = R.string.outbound_orders_subtitle,
            route = AppRoute.OutboundOrders,
            requiredPermission = Permission.OUTBOUND_VIEW,
        ),
    )
}
