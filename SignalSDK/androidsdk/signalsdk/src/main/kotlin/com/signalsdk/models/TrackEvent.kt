package com.signalsdk.models

internal data class TrackEvent(
    val event_id: String,
    val event_name: String,
    val schema_version: Int,
    val user_id: String,
    val session_id: String,
    val timestamp: String,
    val sdk: SdkInfo,
    val device: DeviceInfo,
    val properties: Map<String, Any?>
)
