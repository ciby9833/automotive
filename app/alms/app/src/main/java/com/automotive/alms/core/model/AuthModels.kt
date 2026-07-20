package com.automotive.alms.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class LoginMode {
    EXTERNAL,
    SINGLE_ORG,
    NEEDS_SELECTION,
}

@Serializable
data class UserSummary(
    val id: String,
    val username: String,
    val displayName: String,
    val role: Role,
    val email: String? = null,
)

@Serializable
data class MembershipSummary(
    val organizationId: String,
    val organizationCode: String,
    val organizationName: String,
    val role: Role,
)

@Serializable
data class ExternalContext(
    val carrierId: String? = null,
    val customerId: String? = null,
)

@Serializable
data class LoginResult(
    val mode: LoginMode,
    val accessToken: String,
    val user: UserSummary,
    val memberships: List<MembershipSummary> = emptyList(),
    val activeOrgId: String? = null,
    val externalContext: ExternalContext? = null,
    val permissions: List<String> = emptyList(),
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

@Serializable
data class SelectOrgRequest(
    val organizationId: String,
)

@Serializable
data class CurrentUserResult(
    val userId: String,
    val username: String,
    val role: Role,
    val preAuth: Boolean,
    val activeOrgId: String? = null,
    val scopeYardId: String? = null,
    val carrierId: String? = null,
    val customerId: String? = null,
    val permissions: List<String> = emptyList(),
)
