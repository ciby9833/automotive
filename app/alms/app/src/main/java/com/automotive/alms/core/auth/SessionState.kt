package com.automotive.alms.core.auth

import com.automotive.alms.core.model.LoginResult

data class SessionState(
    val accessToken: String? = null,
    val loginResult: LoginResult? = null,
) {
    val isAuthenticated: Boolean
        get() = !accessToken.isNullOrBlank() && loginResult != null
}
