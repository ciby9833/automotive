package com.automotive.alms.feature.waybill.data

import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.core.network.Paginated
import com.automotive.alms.core.upload.UploadedFile
import com.automotive.alms.feature.waybill.model.DepartWaybillRequest
import com.automotive.alms.feature.waybill.model.LoadVinRequest
import com.automotive.alms.feature.waybill.model.LoadVinResult
import com.automotive.alms.feature.waybill.model.Waybill
import com.automotive.alms.feature.waybill.model.WaybillLookupResult
import com.automotive.alms.feature.waybill.model.WaybillScanRequest

class WaybillRepository(
    private val apiClient: ApiClient,
) {
    // 后端 /waybills 现在统一返回分页 shape {items,total,page,pageSize}；
    // App 侧目前不做分页 UI（司机通常几十单，走 all=true 一次拿全量），
    // 后端硬顶 100 万条对 App 场景毫无风险。
    suspend fun list(status: String? = null): List<Waybill> {
        val statusPart = status?.let { "&status=$it" }.orEmpty()
        val page: Paginated<Waybill> = apiClient.get("/waybills?all=true$statusPart")
        return page.items
    }

    suspend fun detail(id: String): Waybill {
        return apiClient.get("/waybills/$id")
    }

    suspend fun lookup(vin: String): WaybillLookupResult {
        return apiClient.get("/waybills/lookup/$vin")
    }

    suspend fun loadVin(waybillId: String, vin: String, request: LoadVinRequest): LoadVinResult {
        return apiClient.post("/waybills/$waybillId/vins/$vin/load", request)
    }

    suspend fun depart(waybillId: String, request: DepartWaybillRequest): Waybill {
        return apiClient.post("/waybills/$waybillId/depart", request)
    }

    suspend fun sign(request: WaybillScanRequest): Waybill {
        return apiClient.post("/waybills/scan", request)
    }

    suspend fun uploadPhoto(fileName: String, bytes: ByteArray): UploadedFile {
        return apiClient.uploadFile(
            path = "/storage/upload",
            fileName = fileName,
            contentType = "image/jpeg",
            bytes = bytes,
        )
    }
}
