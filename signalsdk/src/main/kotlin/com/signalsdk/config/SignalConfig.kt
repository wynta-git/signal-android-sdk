package com.signalsdk.config

import com.signalsdk.utils.ApiLogEntry

/**
 * Configuration passed to [com.signalsdk.SignalSDK.initSDK].
 *
 * @param clientId       Your project's client ID (X-Client-Id header).
 * @param clientSecret   Your project's client secret (X-Client-Secret header).
 * @param debug          Enable verbose logcat output. Default false.
 * @param onApiLog       Optional callback fired after every outbound API request. Useful for debugging.
 * @param smallIconResId Drawable resource ID for campaign push notifications' status-bar icon
 *                       (`NotificationCompat.setSmallIcon`). Android force-renders this as a flat
 *                       monochrome silhouette from its alpha channel regardless of what's passed in —
 *                       use a simple white-on-transparent icon designed for that, not your full-color
 *                       launcher icon. If omitted, the SDK looks for a drawable named
 *                       `ic_notification_icon` in your app (the same convention MoEngage uses in this
 *                       codebase) and falls back to a generic system icon if that's not found either.
 */
data class SignalConfig(
    val clientId: String,
    val clientSecret: String,
    val debug: Boolean = false,
    val onApiLog: ((ApiLogEntry) -> Unit)? = null,
    val smallIconResId: Int? = null
)
