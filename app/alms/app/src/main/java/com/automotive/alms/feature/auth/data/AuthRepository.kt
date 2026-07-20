package com.automotive.alms.feature.auth.data

import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.model.CurrentUserResult
import com.automotive.alms.core.model.LoginRequest
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.model.SelectOrgRequest
import com.automotive.alms.core.network.ApiClient

class AuthRepository(
    private val apiClient: ApiClient,
    private val sessionStore: SessionStore,
) {
    suspend fun login(username: String, password: String): LoginResult {
        val result = apiClient.post<LoginRequest, LoginResult>(
            path = "/auth/login",
            body = LoginRequest(username = username, password = password),
        )
        sessionStore.save(result)
        return result
    }

    suspend fun selectOrg(organizationId: String): LoginResult {
        val result = apiClient.post<SelectOrgRequest, LoginResult>(
            path = "/auth/select-org",
            body = SelectOrgRequest(organizationId = organizationId),
        )
        sessionStore.save(result)
        return result
    }

    suspend fun me(): CurrentUserResult {
        return apiClient.get("/auth/me")
    }

    fun logoutLocal() {
        sessionStore.clear()
    }
}
