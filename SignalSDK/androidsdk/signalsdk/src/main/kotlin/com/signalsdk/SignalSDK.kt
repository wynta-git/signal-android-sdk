package com.signalsdk

import android.content.Context
import com.signalsdk.config.SignalConfig
import com.signalsdk.models.IdentifyRequest
import com.signalsdk.models.IdentityPayload
import com.signalsdk.models.SDKResponse
import com.signalsdk.services.DeviceService
import com.signalsdk.services.EventService
import com.signalsdk.services.IdentityService
import com.signalsdk.services.LifecycleService
import com.signalsdk.services.SessionService
import com.signalsdk.services.toJsonObject
import com.signalsdk.store.SDKState
import com.signalsdk.utils.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Signal Android SDK — main entry point.
 *
 * Typical usage:
 * ```kotlin
 * // Application.onCreate()
 * SignalSDK.initSDK(this, SignalConfig(clientId = "…", clientSecret = "…"))
 *
 * // After determining auth state
 * SignalSDK.setIdentity(IdentityPayload(userId = userId))
 *
 * // After login
 * SignalSDK.setIdentity(IdentityPayload(userId = realUserId))
 *
 * // After logout
 * SignalSDK.clearIdentity()
 * SignalSDK.setIdentity(IdentityPayload(userId = newAnonUuid))
 * ```
 */
object SignalSDK {

    @Volatile private var state = SDKState()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private lateinit var eventService: EventService
    private lateinit var identityService: IdentityService
    private lateinit var lifecycleService: LifecycleService

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    companion object {
        private const val QA_PREFIX    = "QA_"
        private const val PROD_BASE_URL = "https://api.wynta.com/api/v1"
        private const val QA_BASE_URL   = "https://qa-app.fozilpartners.com/api/v1"
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    /**
     * Initialize the SDK. Call once from [android.app.Application.onCreate].
     * Does not require an identity — call [setIdentity] immediately after.
     *
     * Prefix [SignalConfig.clientId] with `QA_` to route all traffic to the QA
     * environment. The prefix is stripped before being sent in API headers.
     */
    fun initSDK(context: Context, config: SignalConfig) {
        require(config.clientId.isNotBlank())     { "clientId must not be blank" }
        require(config.clientSecret.isNotBlank()) { "clientSecret must not be blank" }

        if (config.debug) Logger.enable()

        // Strip QA_ prefix and resolve the correct base URL
        val isQa       = config.clientId.startsWith(QA_PREFIX)
        val cleanId    = if (isQa) config.clientId.removePrefix(QA_PREFIX) else config.clientId
        val baseUrl    = if (isQa) QA_BASE_URL else PROD_BASE_URL

        Logger.log("initSDK | env=${if (isQa) "QA" else "PROD"} | baseUrl=$baseUrl")

        val appContext   = context.applicationContext
        val deviceService = DeviceService(appContext)

        eventService   = EventService(deviceService)
        identityService = IdentityService()
        lifecycleService = LifecycleService(
            scope    = scope,
            getState = { state },
            emit     = { eventName -> emitLifecycleEvent(eventName) }
        )

        updateState { copy(
            clientId      = cleanId,
            clientSecret  = config.clientSecret,
            baseUrl       = baseUrl,
            userId        = null,
            appOpenTracked = false,
            initialized   = true
        )}

        // Fresh session on every cold launch
        SessionService.reset()
        SessionService.getSessionId()

        lifecycleService.start()

        Logger.log("SDK initialized | session=${SessionService.getSessionId()} | call setIdentity() next")
    }

    // ── Identity ──────────────────────────────────────────────────────────────

    /**
     * Set or update the active identity. Pass the logged-in user ID or an anonymous UUID.
     *
     * On the **first call after [initSDK]** the SDK automatically fires:
     *   sdk_init → session_started → app_opened
     *
     * Subsequent calls (e.g. login, FCM token refresh) only call the identify API.
     *
     * @param callback Optional result callback, invoked on the main thread.
     */
    fun setIdentity(payload: IdentityPayload, callback: ((SDKResponse) -> Unit)? = null) {
        val current = state
        if (!current.initialized) {
            callback?.invoke(SDKResponse(success = false, error = "SDK not initialized. Call initSDK() first."))
            return
        }

        val userId = payload.userId ?: current.userId
        if (userId.isNullOrBlank()) {
            callback?.invoke(SDKResponse(success = false, error = "userId is required."))
            return
        }

        val fcmToken = payload.fcmToken ?: current.fcmToken

        // Flatten traits into a plain map so the backend receives snake_case keys
        val traitsMap = mutableMapOf<String, Any?>()
        payload.traits?.let { t ->
            t.email?.let            { traitsMap["email"]             = it }
            t.phone?.let            { traitsMap["phone"]             = it }
            t.firstName?.let        { traitsMap["first_name"]        = it }
            t.lastName?.let         { traitsMap["last_name"]         = it }
            t.dateOfBirth?.let      { traitsMap["date_of_birth"]     = it }
            t.country?.let          { traitsMap["country"]           = it }
            t.currency?.let         { traitsMap["currency"]          = it }
            t.language?.let         { traitsMap["language"]          = it }
            t.kycStatus?.let        { traitsMap["kyc_status"]        = it }
            t.vipLevel?.let         { traitsMap["vip_level"]         = it }
            t.accountStatus?.let    { traitsMap["account_status"]    = it }
            t.registrationDate?.let { traitsMap["registration_date"] = it }
            t.brandId?.let          { traitsMap["brand_id"]          = it }
            traitsMap.putAll(t.custom)
        }
        // Always merge fcm_token into traits so it reaches the backend
        fcmToken?.let { traitsMap["fcm_token"] = it }

        // Update in-memory state before the network call
        updateState { copy(userId = userId, fcmToken = fcmToken) }

        val request = IdentifyRequest(
            user_id      = userId,
            anonymous_id = payload.anonymousId,
            traits       = traitsMap.ifEmpty { null },
            unset_traits = payload.unsetTraits,
            timestamp    = payload.timestamp ?: isoFormat.format(Date())
        )

        Logger.log("setIdentity → user: $userId")

        val wasTracked = current.appOpenTracked

        scope.launch {
            val result = identityService.identifyPlayer(request, current.clientId!!, current.clientSecret!!, current.baseUrl)

            if (result.success && !wasTracked) {
                updateState { copy(appOpenTracked = true) }
                // Auto-track init bundle — same order as RN SDK
                listOf("sdk_init", "session_started", "app_opened").forEach { emitLifecycleEvent(it) }
            }

            callback?.invoke(result)
        }
    }

    /**
     * Clear the active identity (call on logout).
     * Generate a new anonymous UUID and call [setIdentity] immediately after.
     */
    fun clearIdentity() {
        updateState { copy(userId = null) }
        Logger.log("Identity cleared")
    }

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * Track a custom event.
     *
     * @param eventName  Non-empty event name (e.g. "deposit_success").
     * @param properties Arbitrary key-value properties. Supports nested maps and lists.
     * @param callback   Optional result callback, invoked on the main thread.
     */
    fun sendEvent(
        eventName: String,
        properties: Map<String, Any?> = emptyMap(),
        callback: ((SDKResponse) -> Unit)? = null
    ) {
        val current = state
        if (!current.initialized) {
            callback?.invoke(SDKResponse(success = false, error = "SDK not initialized. Call initSDK() first."))
            return
        }
        val userId = current.userId
        if (userId.isNullOrBlank()) {
            callback?.invoke(SDKResponse(success = false, error = "No identity set. Call setIdentity() first."))
            return
        }
        require(eventName.isNotBlank()) { "eventName must not be blank" }

        scope.launch {
            val event = eventService.buildEvent(eventName, properties, userId)
            Logger.log("sendEvent: $eventName | event_id=${event.event_id}")
            val result = eventService.trackEvent(event, current.clientId!!, current.clientSecret!!, current.baseUrl)
            callback?.invoke(result)
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private suspend fun emitLifecycleEvent(eventName: String) {
        val current = state
        if (!current.initialized) return
        val userId = current.userId ?: return
        val event = eventService.buildEvent(eventName, emptyMap(), userId)
        Logger.log("Lifecycle event: $eventName | event_id=${event.event_id}")
        eventService.trackEvent(event, current.clientId!!, current.clientSecret!!, current.baseUrl)
    }

    private fun updateState(update: SDKState.() -> SDKState) {
        synchronized(this) { state = state.update() }
    }
}
