package com.automotive.alms.feature.pickup.data

import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.feature.pickup.model.PickupLookupResult
import com.automotive.alms.feature.pickup.model.PickupScanRequest
import com.automotive.alms.feature.pickup.model.PickupVin
import java.net.URLEncoder

class PickupRepository(
    private val apiClient: ApiClient,
) {
    suspend fun lookup(vin: String): PickupLookupResult {
        val encodedVin = URLEncoder.encode(vin, Charsets.UTF_8.name())
        return apiClient.get("/pickup/lookup/$encodedVin")
    }

    suspend fun scan(request: PickupScanRequest): PickupVin {
        return apiClient.post("/pickup/scan", request)
    }

    suspend fun myPickups(): List<PickupVin> {
        return apiClient.get("/pickup/my")
    }
}
