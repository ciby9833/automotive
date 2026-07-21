package com.automotive.alms.core.config

import android.content.Context
import com.automotive.alms.BuildConfig
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.network.ApiClient
import com.automotive.alms.core.network.AuthInterceptor
import com.automotive.alms.core.permission.PermissionManager
import com.automotive.alms.feature.auth.data.AuthRepository
import com.automotive.alms.feature.pickup.data.PickupRepository
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

class AppContainer(context: Context) {
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    val sessionStore = SessionStore(context, json)
    val permissionManager = PermissionManager(sessionStore)

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(AuthInterceptor { sessionStore.state.value.accessToken })
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) {
                    HttpLoggingInterceptor.Level.BASIC
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            },
        )
        .build()

    val apiClient = ApiClient(
        baseUrl = BuildConfig.API_BASE_URL,
        httpClient = httpClient,
        json = json,
    )

    val authRepository = AuthRepository(apiClient, sessionStore)
    val pickupRepository = PickupRepository(apiClient)
}
