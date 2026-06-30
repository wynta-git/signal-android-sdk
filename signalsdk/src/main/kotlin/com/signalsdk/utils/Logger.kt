package com.signalsdk.utils

import android.util.Log

internal object Logger {
    private const val TAG = "[SignalSDK]"
    @Volatile private var enabled = false

    fun enable() { enabled = true }

    fun log(message: String) {
        if (enabled) Log.d(TAG, message)
    }

    fun error(message: String, throwable: Throwable? = null) {
        if (enabled) Log.e(TAG, message, throwable)
    }
}
