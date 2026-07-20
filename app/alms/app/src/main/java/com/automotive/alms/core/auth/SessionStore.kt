package com.automotive.alms.core.auth

import android.content.Context
import com.automotive.alms.core.model.LoginResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class SessionStore(
    context: Context,
    private val json: Json,
) {
    private val preferences = context.getSharedPreferences("alms_session", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(loadInitialState())

    val state: StateFlow<SessionState> = _state

    fun save(result: LoginResult) {
        preferences.edit()
            .putString(KEY_TOKEN, result.accessToken)
            .putString(KEY_LOGIN_RESULT, json.encodeToString(result))
            .apply()
        _state.value = SessionState(result.accessToken, result)
    }

    fun clear() {
        preferences.edit().clear().apply()
        _state.value = SessionState()
    }

    private fun loadInitialState(): SessionState {
        val token = preferences.getString(KEY_TOKEN, null)
        val raw = preferences.getString(KEY_LOGIN_RESULT, null)
        val result = raw?.let { runCatching { json.decodeFromString<LoginResult>(it) }.getOrNull() }
        return SessionState(token, result)
    }

    private companion object {
        const val KEY_TOKEN = "access_token"
        const val KEY_LOGIN_RESULT = "login_result"
    }
}
