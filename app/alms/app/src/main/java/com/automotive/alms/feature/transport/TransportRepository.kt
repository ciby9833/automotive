package com.automotive.alms.feature.transport

import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.core.upload.UploadedFile
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.net.URLEncoder

@Serializable
data class TransportTrip(
    val id: String,
    val code: String,
    val status: String,
    @SerialName("tow_type") val towType: String,
    val capacity: Int,
    @SerialName("carrier_name") val carrierName: String = "",
    @SerialName("driver_name") val driverName: String = "",
    @SerialName("driver_phone") val driverPhone: String? = null,
    @SerialName("plate_number") val plateNumber: String = "",
    @SerialName("line_count") val lineCount: Int = 0,
    @SerialName("loaded_count") val loadedCount: Int = 0,
    @SerialName("delivered_count") val deliveredCount: Int = 0,
    val origins: String? = null,
    val destinations: String? = null,
    @SerialName("open_exceptions") val openExceptions: Int = 0,
)

@Serializable
data class TransportLine(
    val id: String,
    val vin: String? = null,
    val status: String,
    @SerialName("line_no") val lineNo: Int = 0,
    @SerialName("order_code") val orderCode: String = "",
    @SerialName("customer_name") val customerName: String = "",
    @SerialName("origin_id") val originId: String,
    @SerialName("origin_name") val originName: String = "",
    @SerialName("origin_code") val originCode: String? = null,
    @SerialName("destination_id") val destinationId: String,
    @SerialName("destination_name") val destinationName: String = "",
    @SerialName("destination_code") val destinationCode: String? = null,
    @SerialName("vehicle_model") val vehicleModel: String = "",
    @SerialName("vehicle_color") val vehicleColor: String = "",
)

@Serializable
data class TransportDocument(
    val id: String,
    @SerialName("file_key") val fileKey: String,
    @SerialName("file_name") val fileName: String,
)

@Serializable
data class TransportLeg(
    val originId: String,
    val originName: String = "",
    val originCode: String? = null,
    val destinationId: String,
    val destinationName: String = "",
    val destinationCode: String? = null,
    val lines: Int = 0,
    val loaded: Int = 0,
    val delivered: Int = 0,
    val documents: List<TransportDocument> = emptyList(),
)

@Serializable
data class TransportException(
    val id: String,
    val type: String,
    val status: String,
    val vin: String? = null,
    val note: String = "",
)

@Serializable
data class TransportTripDetail(
    val trip: TransportTrip,
    val lines: List<TransportLine> = emptyList(),
    val legs: List<TransportLeg> = emptyList(),
    val exceptions: List<TransportException> = emptyList(),
)

@Serializable
data class TransportTripPage(val items: List<TransportTrip>, val total: Int)

@Serializable
data class PickupRequest(
    val vin: String,
    val lineId: String? = null,
    val photoKeys: List<String> = emptyList(),
    val latitude: Double? = null,
    val longitude: Double? = null,
)

/** result = PICKED / CHOOSE_LINE（多条路线时让司机选门店）/ UNPLANNED（计划外，交内部处理） */
@Serializable
data class PickupResult(
    val result: String,
    val line: TransportLine? = null,
    val options: List<TransportLine> = emptyList(),
)

@Serializable
data class SignRequest(val vin: String, val photoKeys: List<String> = emptyList())

@Serializable
data class SignResult(val result: String)

@Serializable
data class ExceptionRequest(val type: String, val vin: String? = null, val note: String)

@Serializable
data class DepartResult(val ok: Boolean, val returned: Int = 0)

class TransportRepository(private val api: ApiClient) {
    suspend fun trips(status: String, search: String, page: Int): TransportTripPage =
        api.get("/transport/trips?status=${enc(status)}&search=${enc(search)}&page=$page&pageSize=50")

    suspend fun trip(id: String): TransportTripDetail = api.get("/transport/trips/$id")

    suspend fun pickup(id: String, request: PickupRequest): PickupResult =
        api.post("/transport/trips/$id/pickup", request)

    suspend fun depart(id: String): DepartResult = api.postEmpty("/transport/trips/$id/depart")

    suspend fun sign(id: String, request: SignRequest): SignResult = api.post("/transport/trips/$id/sign", request)

    suspend fun recordException(id: String, request: ExceptionRequest): TransportException =
        api.post("/transport/trips/$id/exceptions", request)

    suspend fun photo(bytes: ByteArray): UploadedFile =
        api.uploadFile("/storage/upload", "transport-${System.currentTimeMillis()}.jpg", "image/jpeg", bytes)

    /** POD 按段上传：一个（起点，终点）组合一张 */
    suspend fun pod(id: String, leg: TransportLeg, bytes: ByteArray, mime: String): TransportDocument =
        api.uploadFile(
            path = "/transport/trips/$id/documents",
            fileName = "POD-${System.currentTimeMillis()}.${if (mime == "application/pdf") "pdf" else "jpg"}",
            contentType = mime,
            bytes = bytes,
            fields = mapOf("originId" to leg.originId, "destinationId" to leg.destinationId),
        )

    private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
}
