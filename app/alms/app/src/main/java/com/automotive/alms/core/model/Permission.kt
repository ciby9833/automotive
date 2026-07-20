package com.automotive.alms.core.model

object Permission {
    const val YARD_VIEW_BOARD = "yard:view-board"
    const val YARD_ASSIGN_SLOT = "yard:assign-slot"
    const val YARD_RELEASE_SLOT = "yard:release-slot"
    const val YARD_MOVE_VEHICLE = "yard:move-vehicle"
    const val YARD_VIEW_VIN_INVENTORY = "yard:view-vin-inventory"

    const val ORDER_VIEW = "order:view"
    const val ORDER_CREATE = "order:create"
    const val WAYBILL_VIEW = "waybill:view"
    const val WAYBILL_CREATE = "waybill:create"
    const val WAYBILL_SCAN = "waybill:scan"

    const val FINANCE_VIEW = "finance:view"
    const val FINANCE_CONFIRM = "finance:confirm"

    const val TRACKING_VIEW = "tracking:view"

    const val INBOUND_VIEW = "inbound:view"
    const val INBOUND_SCAN = "inbound:scan"
    const val INBOUND_BATCH_MANAGE = "inbound:batch-manage"
    const val PICKUP_SCAN = "pickup:scan"
    const val PICKUP_VIEW = "pickup:view"

    const val OUTBOUND_VIEW = "outbound:view"
    const val OUTBOUND_PLAN = "outbound:plan"
}
