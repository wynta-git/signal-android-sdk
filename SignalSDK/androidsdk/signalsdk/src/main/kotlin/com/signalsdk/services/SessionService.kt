package com.signalsdk.services

import java.util.UUID

internal object SessionService {
    @Volatile private var sessionId: String? = null

    fun getSessionId(): String =
        sessionId ?: UUID.randomUUID().toString().also { sessionId = it }

    fun reset() { sessionId = null }
}
