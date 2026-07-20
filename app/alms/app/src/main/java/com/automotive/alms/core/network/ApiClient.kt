package com.automotive.alms.core.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ApiClient(
    @PublishedApi internal val baseUrl: String,
    @PublishedApi internal val httpClient: OkHttpClient,
    @PublishedApi internal val json: Json,
) {
    @PublishedApi
    internal val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend inline fun <reified T> get(path: String): T {
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .get()
            .build()
        return execute(request)
    }

    suspend inline fun <reified B, reified T> post(path: String, body: B): T {
        val requestBody = json.encodeToString(body).toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .post(requestBody)
            .build()
        return execute(request)
    }

    suspend inline fun <reified T> postEmpty(path: String): T {
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .post(ByteArray(0).toRequestBody(null))
            .build()
        return execute(request)
    }

    suspend inline fun <reified T> execute(request: Request): T = withContext(Dispatchers.IO) {
        httpClient.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw parseError(response.code, raw)
            }
            val envelope = json.decodeFromString<ApiEnvelope<T>>(raw)
            envelope.data ?: throw ApiException(response.code, envelope.code, envelope.message ?: "响应数据为空")
        }
    }

    @PublishedApi
    internal fun parseError(statusCode: Int, raw: String): ApiException {
        val parsed = runCatching { json.decodeFromString<ApiErrorEnvelope>(raw) }.getOrNull()
        return ApiException(
            statusCode = statusCode,
            errorCode = parsed?.code,
            message = parsed?.message ?: raw.ifBlank { "请求失败，请稍后重试" },
        )
    }
}
