package com.automotive.alms.core.network

fun interface TokenProvider {
    fun currentToken(): String?
}
