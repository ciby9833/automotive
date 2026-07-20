package com.automotive.alms.core.permission

import com.automotive.alms.core.auth.SessionStore

class PermissionManager(
    private val sessionStore: SessionStore,
) {
    fun has(permission: String): Boolean {
        return sessionStore.state.value.loginResult?.permissions?.contains(permission) == true
    }

    fun hasAny(vararg permissions: String): Boolean {
        return permissions.any(::has)
    }
}
