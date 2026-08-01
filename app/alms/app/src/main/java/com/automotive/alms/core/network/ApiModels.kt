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

// 与后端 PaginatedResult<T> 对齐：所有列表端点（waybills / inbound orders /
// outbound orders / vin inventory）现在都返回 {items, total, page, pageSize}。
// 老 App 版本按 List<T> 反序列化会 "Expected start of the array '['" 报错。
@Serializable
data class Paginated<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 20,
)
