package com.automotive.alms.feature.pickup.model

import kotlinx.serialization.Serializable

@Serializable
data class PickupVin(
    val id: String,
    val orderId: String? = null,
    val vin: String,
    val brand: String? = null,
    val model: String? = null,
    val color: String? = null,
    val vehicleType: String? = null,
    val motorNo: String? = null,
    val arrivalStatus: String? = null,
    val pickedUpAt: String? = null,
    val pickupLocation: String? = null,
    val pickupLatitude: Double? = null,
    val pickupLongitude: Double? = null,
    val pickupPhotoUrls: List<String>? = null,
    val pickupRemark: String? = null,
    val order: PickupOrder? = null,
)

@Serializable
data class PickupOrder(
    val id: String? = null,
    val orderCode: String? = null,
    val customerOrderNo: String? = null,
    val originText: String? = null,
    val customer: PickupCustomer? = null,
)

@Serializable
data class PickupCustomer(
    val id: String? = null,
    val name: String? = null,
)

@Serializable
data class PickupOrderSummary(
    val id: String,
    val orderCode: String,
    val customerOrderNo: String? = null,
    val customerName: String,
    val originText: String? = null,
    val destinationYardName: String? = null,
    val plannedPickupDate: String? = null,
    val pickupStatus: String,
    val pickupStartedAt: String? = null,
    val pickupCompletedAt: String? = null,
    val pickupDriverUserName: String? = null,
    val total: Int,
    val pickedUp: Int,
    val remaining: Int,
    val createdAt: String? = null,
)

@Serializable
data class PickupOrderDetail(
    val order: PickupTaskOrder,
    val vins: List<PickupVin>,
    val stats: PickupOrderStats,
)

@Serializable
data class PickupTaskOrder(
    val id: String,
    val orderCode: String,
    val customerOrderNo: String? = null,
    val originText: String? = null,
    val destinationText: String? = null,
    val plannedPickupDate: String? = null,
    val pickupStatus: String,
    val pickupStartedAt: String? = null,
    val pickupCompletedAt: String? = null,
    val customer: PickupCustomer? = null,
    val destinationYard: PickupYard? = null,
)

@Serializable
data class PickupYard(
    val id: String? = null,
    val name: String? = null,
)

@Serializable
data class PickupOrderStats(
    val total: Int,
    val pickedUp: Int,
    val arrived: Int,
    val cancelled: Int,
    val remaining: Int,
)

@Serializable
data class PickupOrderScanRequest(
    val vin: String,
    val allowOutOfOrder: Boolean = true,
    val location: String? = null,
    val pickupLatitude: Double? = null,
    val pickupLongitude: Double? = null,
    val photoUrls: List<String>? = null,
    val remark: String? = null,
)

@Serializable
data class PickupOrderScanResult(
    val vin: PickupVin,
    val outOfOrder: Boolean,
    val orderPickupStatus: String,
)
