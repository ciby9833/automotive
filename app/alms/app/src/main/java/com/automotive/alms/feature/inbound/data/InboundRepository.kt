package com.automotive.alms.feature.inbound.data

import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.core.upload.UploadedFile
import com.automotive.alms.feature.inbound.model.InboundScanRequest
import com.automotive.alms.feature.inbound.model.InboundVinResult

class InboundRepository(
    private val apiClient: ApiClient,
) {
    suspend fun scan(request: InboundScanRequest): InboundVinResult {
        return apiClient.post("/inbound/scan", request)
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
