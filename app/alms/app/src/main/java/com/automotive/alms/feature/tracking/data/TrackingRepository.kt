package com.automotive.alms.feature.tracking.data

import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.feature.tracking.model.DriverPositionBatchRequest
import com.automotive.alms.feature.tracking.model.DriverPositionBatchResult

class TrackingRepository(
    private val apiClient: ApiClient,
) {
    suspend fun uploadPositions(request: DriverPositionBatchRequest): DriverPositionBatchResult {
        return apiClient.post("/tracking/positions/batch", request)
    }
}
