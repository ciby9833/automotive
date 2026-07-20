package com.automotive.alms.feature.home.model

import com.automotive.alms.core.model.Permission
import com.automotive.alms.core.navigation.AppRoute

data class HomeAction(
    val title: String,
    val subtitle: String,
    val route: AppRoute,
    val requiredPermission: String,
)

object HomeActions {
    val all = listOf(
        HomeAction(
            title = "入库扫描",
            subtitle = "VIN 到仓、库位、批次",
            route = AppRoute.InboundScan,
            requiredPermission = Permission.INBOUND_SCAN,
        ),
        HomeAction(
            title = "提货扫描",
            subtitle = "港口/工厂提车确认",
            route = AppRoute.PickupScan,
            requiredPermission = Permission.PICKUP_SCAN,
        ),
        HomeAction(
            title = "运单",
            subtitle = "任务列表与扫码交接",
            route = AppRoute.WaybillList,
            requiredPermission = Permission.WAYBILL_VIEW,
        ),
        HomeAction(
            title = "VIN 库存",
            subtitle = "在库车辆与生命周期",
            route = AppRoute.YardInventory,
            requiredPermission = Permission.YARD_VIEW_VIN_INVENTORY,
        ),
        HomeAction(
            title = "出库订单",
            subtitle = "客户出库计划与状态",
            route = AppRoute.OutboundOrders,
            requiredPermission = Permission.OUTBOUND_VIEW,
        ),
    )
}
