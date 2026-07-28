package com.automotive.alms.feature.waybill.model

import kotlinx.serialization.Serializable

@Serializable
data class Waybill(
    val id: String,
    val waybillCode: String,
    val customerWaybillCode: String? = null,
    val transportType: String,
    val status: String,
    val carrierId: String? = null,
    val originYardId: String? = null,
    val originText: String? = null,
    val originYard: WaybillYard? = null,
    val destinationYard: WaybillYard? = null,
    val destinationDealer: WaybillDealer? = null,
    val carrier: WaybillCarrier? = null,
    val driver: WaybillDriver? = null,
    val vehicle: WaybillVehicle? = null,
    val recipientName: String? = null,
    val recipientPhone: String? = null,
    val vins: List<WaybillVin> = emptyList(),
    val createdAt: String? = null,
)

@Serializable
data class WaybillVin(
    val id: String,
    val vin: String,
    val model: String? = null,
    val color: String? = null,
    val isSigned: Boolean = false,
    val loadedAt: String? = null,
    val loadPhotoKeys: List<String> = emptyList(),
)

@Serializable
data class WaybillYard(
    val id: String? = null,
    val code: String? = null,
    val name: String? = null,
)

@Serializable
data class WaybillDealer(
    val id: String? = null,
    val dealerName: String? = null,
    val address: String? = null,
    val code: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
)

@Serializable
data class WaybillCarrier(
    val id: String? = null,
    val name: String? = null,
    val shortName: String? = null,
)

@Serializable
data class WaybillDriver(
    val id: String? = null,
    val name: String? = null,
    val phone: String? = null,
)

@Serializable
data class WaybillVehicle(
    val id: String? = null,
    val plateNumber: String? = null,
)

@Serializable
data class LoadVinRequest(
    val photoKeys: List<String>,
    val remark: String? = null,
)

@Serializable
data class LoadVinResult(
    val loadedAt: String,
    val loadedCount: Int,
    val totalCount: Int,
)

@Serializable
data class DepartWaybillRequest(
    val gatePhotoKeys: List<String>? = null,
    val remark: String? = null,
)

@Serializable
data class WaybillScanRequest(
    val vin: String,
    val action: String,
    val attachmentUrls: List<String>? = null,
    val remark: String? = null,
)

@Serializable
data class WaybillLookupResult(
    val vin: String,
    val isSigned: Boolean,
    val waybill: Waybill,
)
