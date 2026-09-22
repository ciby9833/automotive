package com.automotive.alms.feature.home.model

import androidx.annotation.StringRes
import com.automotive.alms.R
import com.automotive.alms.core.model.Permission
import com.automotive.alms.core.navigation.AppRoute

data class HomeAction(
    @StringRes val titleRes: Int,
    val route: AppRoute,
    val requiredPermission: String,
)

object HomeActions {
    val all = listOf(
        HomeAction(R.string.transport_title, AppRoute.Transport, "transport:view"),
        HomeAction(R.string.inbound_title, AppRoute.InboundScan, Permission.INBOUND_SCAN),
        HomeAction(R.string.pickup_title, AppRoute.PickupScan, Permission.PICKUP_SCAN),
        HomeAction(R.string.load_title, AppRoute.LoadScan, Permission.WAYBILL_SCAN),
        HomeAction(R.string.waybill_title, AppRoute.WaybillList, Permission.WAYBILL_VIEW),
    )
}
