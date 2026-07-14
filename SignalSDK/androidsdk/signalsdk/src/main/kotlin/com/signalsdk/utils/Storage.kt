package com.signalsdk.utils

import android.content.Context

internal object StorageKeys {
    const val FCM_TOKEN = "@signal/fcm_token"
}

internal object Storage {
    private const val PREFS_NAME = "signal_sdk_prefs"

    fun get(context: Context, key: String): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(key, null)

    fun set(context: Context, key: String, value: String) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(key, value).apply()

    fun remove(context: Context, key: String) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().remove(key).apply()
}
