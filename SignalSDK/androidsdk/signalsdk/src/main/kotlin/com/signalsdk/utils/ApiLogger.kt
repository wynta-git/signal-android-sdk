package com.signalsdk.utils

import android.os.Handler
import android.os.Looper

/** Describes a single API call made by the SDK. Delivered to the `onApiLog` callback in `SignalConfig`. */
data class ApiLogEntry(
    val url: String,
    val method: String,
    val requestBody: String?,
    val responseStatus: Int?,
    val responseBody: String?
)

internal object ApiLogger {
    var callback: ((ApiLogEntry) -> Unit)? = null

    fun fire(
        url: String,
        method: String,
        requestBody: String?,
        responseStatus: Int?,
        responseBody: String?
    ) {
        val cb = callback ?: return
        val entry = ApiLogEntry(url, method, requestBody, responseStatus, responseBody)
        Handler(Looper.getMainLooper()).post { cb(entry) }
    }
}
