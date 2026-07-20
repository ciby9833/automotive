package com.automotive.alms.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class Role {
    HQ_ADMIN,
    ORG_ADMIN,
    YARD_STAFF,
    CUSTOMER,
    CARRIER_STAFF,
    CARRIER_DRIVER,
}
