package com.automotive.alms.feature.pickup.model

import kotlinx.serialization.Serializable

@Serializable
data class PickupScanRequest(
    val vin: String,
    val location: String? = null,
    val photoUrls: List<String>? = null,
    val remark: String? = null,
)

@Serializable
data class PickupLookupResult(
    val vin: PickupVin,
    val canPickup: Boolean,
    val reason: String? = null,
)

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
