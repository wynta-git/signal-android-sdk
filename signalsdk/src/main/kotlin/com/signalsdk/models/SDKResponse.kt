package com.signalsdk.models

data class SDKResponse(
    val success: Boolean,
    val accepted: Int? = null,
    val rejected: Int? = null,
    val error: String? = null
)
