package com.signalsdk.models

internal data class IdentifyRequest(
    val user_id: String,
    val anonymous_id: String? = null,
    val traits: Map<String, Any?>? = null,
    val unset_traits: List<String>? = null,
    val timestamp: String
)
