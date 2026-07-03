package com.signalsdk.models

/**
 * Payload passed to [com.signalsdk.SignalSDK.setIdentity].
 *
 * @param userId      Logged-in user ID or anonymous UUID. At least one of [userId] or a previously
 *                    stored identity must be present.
 * @param anonymousId Previous anonymous UUID (for stitching pre-login events on the backend).
 * @param fcmToken    FCM push token to register for this identity.
 * @param traits      Player profile traits.
 * @param unsetTraits Trait keys to remove from the backend profile.
 * @param timestamp   ISO-8601 timestamp; defaults to now if omitted.
 */
data class IdentityPayload(
    val userId: String? = null,
    val anonymousId: String? = null,
    val fcmToken: String? = null,
    val traits: PlayerTraits? = null,
    val unsetTraits: List<String>? = null,
    val timestamp: String? = null
)
