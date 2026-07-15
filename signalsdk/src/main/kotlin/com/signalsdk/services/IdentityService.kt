package com.signalsdk.services

import com.signalsdk.models.IdentifyRequest
import com.signalsdk.models.SDKResponse
import com.signalsdk.utils.ApiLogger
import com.signalsdk.utils.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

internal class IdentityService {

    companion object {
        private const val TIMEOUT_MS   = 10_000
    }

    suspend fun identifyPlayer(
        request: IdentifyRequest,
        clientId: String,
        clientSecret: String,
        baseUrl: String
    ): SDKResponse = withContext(Dispatchers.IO) {
        val identifyUrl = "$baseUrl/events/identify"
        try {
            val body = request.toJson().toString()
            Logger.log("setIdentity → POST $identifyUrl\nBody: $body")

            val conn = (URL(identifyUrl).openConnection() as HttpURLConnection).apply {
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

            Logger.log("setIdentity ← $status | $identifyUrl | $response")
            ApiLogger.fire(url = identifyUrl, method = "POST", requestBody = body, responseStatus = status, responseBody = response)

            if (status in 200..299) SDKResponse(success = true)
            else SDKResponse(success = false, error = "HTTP $status: $response")
        } catch (e: Exception) {
            Logger.error("identifyPlayer failed", e)
            ApiLogger.fire(url = identifyUrl, method = "POST", requestBody = null, responseStatus = null, responseBody = null)
            SDKResponse(success = false, error = e.message ?: "Unknown error")
        }
    }

    private fun IdentifyRequest.toJson(): JSONObject = JSONObject().apply {
        put("user_id",   user_id)
        put("timestamp", timestamp)
        anonymous_id?.let { put("anonymous_id", it) }
        traits?.let { put("traits", it.toJsonObject()) }
        unset_traits?.takeIf { it.isNotEmpty() }?.let { list ->
            put("unset_traits", JSONArray().also { arr -> list.forEach(arr::put) })
        }
    }
}
