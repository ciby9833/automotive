package com.automotive.alms.feature.pickup.data

import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.feature.pickup.model.PickupOrderDetail
import com.automotive.alms.feature.pickup.model.PickupOrderScanRequest
import com.automotive.alms.feature.pickup.model.PickupOrderScanResult
import com.automotive.alms.feature.pickup.model.PickupOrderSummary
import com.automotive.alms.core.upload.UploadedFile

class PickupRepository(
    private val apiClient: ApiClient,
) {
    suspend fun pickupOrders(includeCompleted: Boolean = false): List<PickupOrderSummary> {
        return apiClient.get("/pickup/orders?includeCompleted=${if (includeCompleted) "true" else "false"}")
    }

    suspend fun pickupOrderDetail(orderId: String): PickupOrderDetail {
        return apiClient.get("/pickup/orders/$orderId")
    }

    suspend fun scanOrder(orderId: String, request: PickupOrderScanRequest): PickupOrderScanResult {
        return apiClient.post("/pickup/orders/$orderId/scan", request)
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
