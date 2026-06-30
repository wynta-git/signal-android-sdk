package com.signalsdk.services

import com.signalsdk.models.DeviceInfo
import com.signalsdk.models.SDKResponse
import com.signalsdk.models.SdkInfo
import com.signalsdk.models.TrackEvent
import com.signalsdk.utils.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

internal class EventService(private val deviceService: DeviceService) {

    companion object {
        private const val SDK_NAME    = "signal-android-sdk"
        private const val SDK_VERSION = "1.0.0"
        private const val TIMEOUT_MS  = 10_000
    }

    private val sdkInfo = SdkInfo(SDK_NAME, SDK_VERSION)

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun buildEvent(
        eventName: String,
        properties: Map<String, Any?>,
        userId: String
    ): TrackEvent = TrackEvent(
        event_id       = UUID.randomUUID().toString(),
        event_name     = eventName,
        schema_version = 1,
        user_id        = userId,
        session_id     = SessionService.getSessionId(),
        timestamp      = isoFormat.format(Date()),
        sdk            = sdkInfo,
        device         = deviceService.getDeviceInfo(),
        properties     = properties
    )

    suspend fun trackEvent(
        event: TrackEvent,
        clientId: String,
        clientSecret: String,
        baseUrl: String
    ): SDKResponse = withContext(Dispatchers.IO) {
        val trackUrl = "$baseUrl/events/track"
        try {
            val body = JSONObject().apply {
                put("events", JSONArray().put(event.toJson()))
            }.toString()

            Logger.log("trackEvent → POST $trackUrl\nBody: $body")

            val conn = (URL(trackUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = TIMEOUT_MS
                readTimeout    = TIMEOUT_MS
                doOutput       = true
                setRequestProperty("Content-Type",    "application/json")
                setRequestProperty("X-Client-Id",     clientId)
                setRequestProperty("X-Client-Secret", clientSecret)
            }

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }

            val status   = conn.responseCode
            val response = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.readText() ?: ""

            Logger.log("trackEvent ← $status | $trackUrl | $response")

            if (status in 200..299) {
                val json = JSONObject(response)
                SDKResponse(
                    success  = true,
                    accepted = json.optInt("accepted"),
                    rejected = json.optInt("rejected")
                )
            } else {
                SDKResponse(success = false, error = "HTTP $status: $response")
            }
        } catch (e: Exception) {
            Logger.error("trackEvent failed", e)
            SDKResponse(success = false, error = e.message ?: "Unknown error")
        }
    }

    // ── JSON helpers ──────────────────────────────────────────────────────────

    private fun TrackEvent.toJson(): JSONObject = JSONObject().apply {
        put("event_id",       event_id)
        put("event_name",     event_name)
        put("schema_version", schema_version)
        put("user_id",        user_id)
        put("session_id",     session_id)
        put("timestamp",      timestamp)
        put("sdk", JSONObject().apply {
            put("name",    sdk.name)
            put("version", sdk.version)
        })
        put("device",     device.toJson())
        put("properties", properties.toJsonObject())
    }

    private fun DeviceInfo.toJson(): JSONObject = JSONObject().apply {
        put("platform", platform)
        put("os",       os)
        os_version?.let  { put("os_version",  it) }
        app_version?.let { put("app_version", it) }
        device_model?.let { put("device_model", it) }
        manufacturer?.let { put("manufacturer",  it) }
        timezone?.let { put("timezone", it) }
        locale?.let   { put("locale",   it) }
    }
}

// ── Top-level JSON utilities (used by EventService + IdentityService) ────────

internal fun Map<String, Any?>.toJsonObject(): JSONObject = JSONObject().also { obj ->
    forEach { (k, v) -> obj.put(k, v.toJsonElement()) }
}

internal fun Any?.toJsonElement(): Any = when (this) {
    null       -> JSONObject.NULL
    is Map<*, *> -> JSONObject().also { obj ->
        @Suppress("UNCHECKED_CAST")
        (this as Map<String, Any?>).forEach { (k, v) -> obj.put(k, v.toJsonElement()) }
    }
    is List<*>   -> JSONArray().also { arr -> forEach { arr.put(it.toJsonElement()) } }
    is Boolean, is Int, is Long, is Double, is Float, is String -> this
    else         -> toString()
}
