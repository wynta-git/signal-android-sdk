package com.signalsdk.models

internal data class DeviceInfo(
    val platform: String,
    val os: String,
    val os_version: String? = null,
    val app_version: String? = null,
    val device_model: String? = null,
    val manufacturer: String? = null,
    val timezone: String? = null,
    val locale: String? = null
)
