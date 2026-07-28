package com.automotive.alms.feature.tracking.model

import kotlinx.serialization.Serializable

@Serializable
data class DriverPositionBatchRequest(
    val positions: List<DriverPositionPoint>,
)

@Serializable
data class DriverPositionPoint(
    val capturedAt: String,
    val waybillId: String? = null,
    val orderId: String? = null,
    val vin: String? = null,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double? = null,
    val speed: Double? = null,
    val heading: Double? = null,
    val source: String = "android-fused",
)

@Serializable
data class DriverPositionBatchResult(
    val accepted: Int,
)
