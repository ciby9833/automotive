package com.automotive.alms.feature.inbound.model

import kotlinx.serialization.Serializable

@Serializable
data class InboundScanRequest(
    val vin: String,
    val zoneId: String,
    val photoUrls: List<String>,
    val vehicleCheckInfo: Map<String, String>? = null,
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
    val line: Int? = null,
    val row: Int? = null,
    val zone: InboundZone? = null,
    val yard: InboundYard? = null,
)

@Serializable
data class InboundZone(
    val id: String,
    val code: String,
    val name: String? = null,
    val lineCount: Int = 0,
    val rowCount: Int = 0,
)

@Serializable
data class InboundYard(
    val id: String? = null,
    val code: String? = null,
    val name: String? = null,
)

fun InboundSlot.displayCode(): String {
    val zoneCode = zone?.code ?: return ""
    val lineValue = line ?: return ""
    val rowValue = row ?: return ""
    return "$zoneCode-${lineValue.toString().padStart(2, '0')}-${rowValue.toString().padStart(2, '0')}"
}
