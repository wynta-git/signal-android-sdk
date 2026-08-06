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
        val normalized = normalizeTimestamp(value)
        for (pattern in timestampPatterns) {
            try {
                val format = SimpleDateFormat(pattern, Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                return format.parse(normalized)?.time
            } catch (e: Exception) {
                // try next pattern
            }
        }
        return null
    }

    // Backend timestamps are always UTC but sometimes omit the trailing 'Z'/offset
    // designator entirely, and may carry more than millisecond (e.g. 6-digit
    // microsecond) fractional-second precision that SimpleDateFormat's 3-digit
    // 'SSS' pattern can't match — either of which makes every pattern above fail
    // to parse, silently falling back to "never expired". Normalize first: pad or
    // truncate the fractional part to exactly 3 digits, and append 'Z' only when
    // no designator is present at all (an existing numeric offset is left as-is
    // for the XXX patterns to handle). Mirrors the RN SDK's TriggerEngine.ts fix
    // for the same root cause.
    private val designatorRegex = Regex("Z$|[+-]\\d{2}:?\\d{2}$")
    private val fractionRegex = Regex("\\.(\\d+)")

    private fun normalizeTimestamp(value: String): String {
        var result = value
        val fractionMatch = fractionRegex.find(result)
        if (fractionMatch != null) {
            val millis = fractionMatch.groupValues[1].padEnd(3, '0').substring(0, 3)
            result = result.replaceRange(fractionMatch.range, ".$millis")
        }
        if (!designatorRegex.containsMatchIn(result)) {
            result += "Z"
        }
        return result
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
