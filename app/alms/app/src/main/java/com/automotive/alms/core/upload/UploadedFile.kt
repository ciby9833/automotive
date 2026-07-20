package com.automotive.alms.core.upload

import kotlinx.serialization.Serializable

@Serializable
data class UploadedFile(
    val key: String,
    val url: String,
)
