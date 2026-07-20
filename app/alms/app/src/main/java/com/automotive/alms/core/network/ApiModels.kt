package com.automotive.alms.core.network

import kotlinx.serialization.Serializable

@Serializable
data class ApiEnvelope<T>(
    val success: Boolean,
    val data: T? = null,
    val message: String? = null,
    val code: String? = null,
)

@Serializable
data class ApiErrorEnvelope(
    val success: Boolean? = null,
    val statusCode: Int? = null,
    val code: String? = null,
    val message: String? = null,
    val path: String? = null,
    val timestamp: String? = null,
)

class ApiException(
    val statusCode: Int,
    val errorCode: String? = null,
    override val message: String,
) : RuntimeException(message)
