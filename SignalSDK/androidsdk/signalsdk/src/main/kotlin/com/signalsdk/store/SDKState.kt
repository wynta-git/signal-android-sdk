package com.signalsdk.store

internal data class SDKState(
    val clientId: String? = null,
    val clientSecret: String? = null,
    val userId: String? = null,
    val fcmToken: String? = null,
    val initialized: Boolean = false,
    val appOpenTracked: Boolean = false,
    val baseUrl: String = "https://api.wynta.com/api/v1"
)
