package com.signalsdk.config

import com.signalsdk.utils.ApiLogEntry

/**
 * Configuration passed to [com.signalsdk.SignalSDK.initSDK].
 *
 * @param clientId     Your project's client ID (X-Client-Id header).
 * @param clientSecret Your project's client secret (X-Client-Secret header).
 * @param debug        Enable verbose logcat output. Default false.
 * @param onApiLog     Optional callback fired after every outbound API request. Useful for debugging.
 */
data class SignalConfig(
    val clientId: String,
    val clientSecret: String,
    val debug: Boolean = false,
    val onApiLog: ((ApiLogEntry) -> Unit)? = null
)
