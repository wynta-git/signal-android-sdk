package com.signalsdk.models

internal data class NotificationCta(
    val role: String?,
    val label: String?,
    val action: String,
    val value: String?
)

internal data class NotificationMedia(
    val image_url: String?
)

internal data class InboxNotification(
    val notification_id: String,
    val campaign_id: String,
    val media: NotificationMedia?,
    val cta: List<NotificationCta>?,
    val expires_at: String?,
    // "on_session_start" | "on_screen_load" | "on_custom_event"
    val trigger_type: String?,
    val target_screens: List<String>?,
    val target_events: List<String>?
)

internal data class InboxResponse(
    val notifications: List<InboxNotification>,
    val next_cursor: String?,
    val unread_count: Int
)
