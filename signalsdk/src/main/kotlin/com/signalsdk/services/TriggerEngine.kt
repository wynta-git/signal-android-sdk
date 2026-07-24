package com.signalsdk.services

import com.signalsdk.models.InboxNotification
import com.signalsdk.utils.Logger
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

internal sealed class TriggerEvent {
    object SessionStart : TriggerEvent()
    data class ScreenLoad(val screenName: String) : TriggerEvent()
    data class CustomEvent(val eventName: String) : TriggerEvent()
}

/**
 * One evaluator per trigger_type — adding a new trigger type means adding one
 * branch here, no changes needed at any call site. Mirrors the RN SDK's
 * TriggerEngine.ts findEligibleNotification.
 */
internal object TriggerEngine {

    // Accepts a few ISO-8601 variants since minSdk 21 predates java.time.Instant.
    private val timestampPatterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX"
    )

    fun findEligibleNotification(
        notifications: List<InboxNotification>,
        event: TriggerEvent,
        handledNotificationIds: List<String>
    ): InboxNotification? {
        val match = notifications.firstOrNull { notification ->
            notification.notification_id !in handledNotificationIds &&
                !isExpired(notification.expires_at) &&
                !notification.media?.image_url.isNullOrEmpty() &&
                matchesTrigger(notification, event)
        }
        Logger.log("TriggerEngine.findEligibleNotification($event) → ${match?.notification_id ?: "none"}")
        return match
    }

    private fun isExpired(expiresAt: String?): Boolean {
        if (expiresAt.isNullOrEmpty()) return false
        val expiresAtMillis = parseTimestamp(expiresAt) ?: return false
        return expiresAtMillis < System.currentTimeMillis()
    }

    private fun parseTimestamp(value: String): Long? {
        for (pattern in timestampPatterns) {
            try {
                val format = SimpleDateFormat(pattern, Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                return format.parse(value)?.time
            } catch (e: Exception) {
                // try next pattern
            }
        }
        return null
    }

    private fun matchesTrigger(notification: InboxNotification, event: TriggerEvent): Boolean =
        when (notification.trigger_type) {
            "on_session_start" -> event is TriggerEvent.SessionStart
            "on_screen_load" -> event is TriggerEvent.ScreenLoad &&
                notification.target_screens?.contains(event.screenName) == true
            "on_custom_event" -> event is TriggerEvent.CustomEvent &&
                notification.target_events?.contains(event.eventName) == true
            else -> false
        }
}
