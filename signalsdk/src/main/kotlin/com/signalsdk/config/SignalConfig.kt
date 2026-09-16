package com.signalsdk.config

import com.signalsdk.utils.ApiLogEntry

/**
 * Configuration passed to [com.signalsdk.SignalSDK.initSDK].
 *
 * @param clientId       Your project's client ID (X-Client-Id header).
 * @param clientSecret   Your project's client secret (X-Client-Secret header).
 * @param debug          Enable verbose logcat output. Default false.
 * @param onApiLog       Optional callback fired after every outbound API request. Useful for debugging.
 * @param smallIconResId        Drawable resource ID for campaign push notifications' status-bar
 *                              icon (`NotificationCompat.setSmallIcon`). Android force-renders this
 *                              as a flat monochrome silhouette from its alpha channel regardless of
 *                              what's passed in — use a simple white-on-transparent icon designed for
 *                              that, not your full-color launcher icon. If omitted, the SDK looks for
 *                              a drawable named `ic_notification_icon` in your app (the same
 *                              convention MoEngage uses in this codebase) and falls back to a generic
 *                              system icon if that's not found either.
 * @param notificationColorResId Color resource ID used to tint the small icon and app-name text
 *                              (`NotificationCompat.Builder.color`) — matches MoEngage's
 *                              `notificationColorResource`. Applied to every template as a default;
 *                              a `branded` push's own `accentColorHex` still overrides it when
 *                              present. Android has no API to color a plain notification's full
 *                              background (that's reserved for MediaStyle/CallStyle) — this is the
 *                              full extent of what the OS allows here.
 */
data class SignalConfig(
    val clientId: String,
    val clientSecret: String,
    val debug: Boolean = false,
    val onApiLog: ((ApiLogEntry) -> Unit)? = null,
    val smallIconResId: Int? = null,
    val notificationColorResId: Int? = null
)
