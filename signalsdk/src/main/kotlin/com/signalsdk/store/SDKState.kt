package com.signalsdk.store

import com.signalsdk.models.InboxNotification

internal data class SDKState(
    val clientId: String? = null,
    val clientSecret: String? = null,
    val userId: String? = null,
    val fcmToken: String? = null,
    val initialized: Boolean = false,
    val appOpenTracked: Boolean = false,
    val baseUrl: String = "https://api.wynta.com/api/v1",
    // In-app notifications — session-only, reset on process restart (not persisted).
    val handledInAppNotificationIds: List<String> = emptyList(),
    val notificationCache: List<InboxNotification> = emptyList(),
    val isInAppPopupVisible: Boolean = false,
    val currentScreen: String? = null,
    val previousScreen: String? = null,
    // Resolved once in initSDK() — SignalConfig.smallIconResId if set, else a lookup for a
    // drawable named "ic_notification_icon" in the host app, else 0 (PushNotificationBuilder
    // falls back to a generic system icon when this is 0).
    val smallIconResId: Int = 0
)
