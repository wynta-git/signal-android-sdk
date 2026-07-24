package com.signalsdk.services

import com.signalsdk.models.InboxNotification
import com.signalsdk.models.InboxResponse
import com.signalsdk.models.NotificationCta
import com.signalsdk.models.NotificationMedia
import com.signalsdk.utils.ApiLogger
import com.signalsdk.utils.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

internal class NotificationInboxService {

    companion object {
        private const val TIMEOUT_MS = 10_000
    }

    suspend fun fetchInbox(
        userId: String,
        clientId: String,
        clientSecret: String,
        baseUrl: String
    ): InboxResponse = withContext(Dispatchers.IO) {
        val encodedUserId = URLEncoder.encode(userId, "UTF-8")
        val inboxUrl = "$baseUrl/events/notifications/inbox?user_id=$encodedUserId&unread_only=true"

        val conn = (URL(inboxUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Client-Id", clientId)
            setRequestProperty("X-Client-Secret", clientSecret)
        }

        val status = conn.responseCode
        val response = (if (status in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.readText() ?: ""

        Logger.log("fetchInbox ← $status | $inboxUrl | $response")
        ApiLogger.fire(url = inboxUrl, method = "GET", requestBody = null, responseStatus = status, responseBody = response)

        if (status !in 200..299) {
            throw Exception("HTTP $status: $response")
        }

        JSONObject(response).toInboxResponse()
    }

    suspend fun markNotificationsRead(
        notificationIds: List<String>,
        userId: String,
        clientId: String,
        clientSecret: String,
        baseUrl: String
    ): Unit = withContext(Dispatchers.IO) {
        val encodedUserId = URLEncoder.encode(userId, "UTF-8")
        val readUrl = "$baseUrl/events/notifications/read?user_id=$encodedUserId"

        val body = JSONObject().apply {
            put("notification_ids", JSONArray().apply { notificationIds.forEach { put(it) } })
        }.toString()

        Logger.log("markNotificationsRead → POST $readUrl\nBody: $body")

        val conn = (URL(readUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Client-Id", clientId)
            setRequestProperty("X-Client-Secret", clientSecret)
        }

        OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }

        val status = conn.responseCode
        val response = (if (status in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.readText() ?: ""

        Logger.log("markNotificationsRead ← $status | $readUrl | $response")
        ApiLogger.fire(url = readUrl, method = "POST", requestBody = body, responseStatus = status, responseBody = response)

        if (status !in 200..299) {
            throw Exception("HTTP $status: $response")
        }
    }

    // ── JSON parsing ──────────────────────────────────────────────────────────

    private fun JSONObject.optNullableString(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null

    private fun JSONObject.toInboxResponse(): InboxResponse {
        val notificationsArray = optJSONArray("notifications") ?: JSONArray()
        val notifications = (0 until notificationsArray.length()).map {
            notificationsArray.getJSONObject(it).toInboxNotification()
        }
        return InboxResponse(
            notifications = notifications,
            next_cursor = optNullableString("next_cursor"),
            unread_count = optInt("unread_count", 0)
        )
    }

    private fun JSONObject.toInboxNotification(): InboxNotification {
        val mediaObj = optJSONObject("media")
        val ctaArray = optJSONArray("cta")
        val targetScreensArray = optJSONArray("target_screens")
        val targetEventsArray = optJSONArray("target_events")
        return InboxNotification(
            notification_id = getString("notification_id"),
            campaign_id = getString("campaign_id"),
            media = mediaObj?.let { NotificationMedia(image_url = it.optNullableString("image_url")) },
            cta = ctaArray?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it).toNotificationCta() } },
            expires_at = optNullableString("expires_at"),
            trigger_type = optNullableString("trigger_type"),
            target_screens = targetScreensArray?.let { arr -> (0 until arr.length()).map { arr.getString(it) } },
            target_events = targetEventsArray?.let { arr -> (0 until arr.length()).map { arr.getString(it) } }
        )
    }

    private fun JSONObject.toNotificationCta(): NotificationCta = NotificationCta(
        role = optNullableString("role"),
        label = optNullableString("label"),
        action = optString("action", "dismiss"),
        value = optNullableString("value")
    )
}
