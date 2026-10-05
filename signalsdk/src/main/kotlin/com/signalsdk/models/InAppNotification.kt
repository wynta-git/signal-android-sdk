package com.signalsdk.models

internal data class NotificationCta(
    val role: String?,           // "primary" | "secondary"
    val label: String?,
    val action: String,          // "deep_link" | "external_url" | "dismiss"
    val value: String?,
    val cta_background_color: String?
)

internal data class NotificationMedia(
    val image_url: String?,
    val background_color: String?,
    val background_opacity: String?  // "opaque" | "translucent" | "transparent" — not yet applied
)

internal data class InboxNotification(
    val notification_id: String,
    val campaign_id: String,
    val variant_id: String?,
    // "full_screen" | "pop_ups" | "bubble" — null/unrecognized falls back to the original
    // fixed image-card layout, so already-scheduled campaigns without this field keep
    // rendering exactly as before.
    val template_type: String?,
    // "native" | "html" — only "native" is rendered today; "html" notifications are
    // currently dropped (logged, not shown) since there's no WebView-based renderer yet.
    val render_engine: String?,
    val title: String?,
    val body: String?,
    val media: NotificationMedia?,
    // Rendered in list order, independent of count — each entry is its own button.
    val cta: List<NotificationCta>?,
    // Any value other than "never" shows the close button (default "always").
    val close_button_visibility: String?,
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
