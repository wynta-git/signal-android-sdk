package com.signalsdk.models

/**
 * Player profile traits sent with [com.signalsdk.SignalSDK.setIdentity].
 * All fields are optional. Use [custom] for any non-standard key-value pairs.
 */
data class PlayerTraits(
    val email: String? = null,
    val phone: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val dateOfBirth: String? = null,
    val country: String? = null,
    val currency: String? = null,
    val language: String? = null,
    val kycStatus: String? = null,
    val vipLevel: String? = null,
    val accountStatus: String? = null,
    val registrationDate: String? = null,
    val brandId: String? = null,
    val fcmToken: String? = null,
    val custom: Map<String, Any?> = emptyMap()
)
