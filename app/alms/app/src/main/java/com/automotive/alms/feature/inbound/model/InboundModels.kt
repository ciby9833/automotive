package com.automotive.alms.feature.inbound.model

import kotlinx.serialization.Serializable

@Serializable
data class InboundScanRequest(
    val vin: String,
    val slotCode: String? = null,
    val zoneCode: String? = null,
    val photoUrls: List<String>,
    val remark: String? = null,
)

@Serializable
data class InboundVinResult(
    val id: String,
    val vin: String,
    val arrivalStatus: String? = null,
    val arrivedAt: String? = null,
    val slot: InboundSlot? = null,
)

@Serializable
data class InboundSlot(
    val id: String? = null,
    val code: String? = null,
    val yard: InboundYard? = null,
)

@Serializable
data class InboundYard(
    val id: String? = null,
    val code: String? = null,
    val name: String? = null,
)
