package com.signalsdk

import android.app.Activity
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import com.signalsdk.config.SignalConfig
import com.signalsdk.models.IdentifyRequest
import com.signalsdk.models.IdentityPayload
import com.signalsdk.models.InboxNotification
import com.signalsdk.models.PushNotificationPayload
import com.signalsdk.models.SDKResponse
import com.signalsdk.services.DeviceService
import com.signalsdk.services.EventService
import com.signalsdk.services.IdentityService
import com.signalsdk.services.LifecycleService
import com.signalsdk.services.NotificationInboxService
import com.signalsdk.services.PushNotificationBuilder
import com.signalsdk.services.SessionService
import com.signalsdk.services.TriggerEngine
import com.signalsdk.services.TriggerEvent
import com.signalsdk.services.toJsonObject
import com.signalsdk.store.SDKState
import com.signalsdk.ui.InAppPopupOverlay
import com.signalsdk.utils.ApiLogger
import com.signalsdk.utils.Logger
import com.signalsdk.utils.Storage
import com.signalsdk.utils.StorageKeys
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.lang.ref.WeakReference
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

    private lateinit var appContext: Context
    private lateinit var eventService: EventService
    private lateinit var identityService: IdentityService
    private lateinit var lifecycleService: LifecycleService
    private lateinit var notificationInboxService: NotificationInboxService

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private const val QA_PREFIX     = "QA_"
    private const val PROD_BASE_URL = "https://api.wynta.com/api/v1"
    private const val QA_BASE_URL   = "https://qa-app.fozilpartners.com/api/v1"
    // Default FCM channel — must match default_notification_channel_id in host app's AndroidManifest.xml
    const val DEFAULT_CHANNEL_ID    = "signal_default"

    // ── Current-Activity tracking (for in-app popup rendering) ─────────────────

    @Volatile private var activityCallbacksRegistered = false
    @Volatile private var currentActivityRef: WeakReference<Activity>? = null

    // A notification that was marked handled + isInAppPopupVisible before any Activity was
    // available to render it on (e.g. trackScreen()/sendEvent() called from a freshly-launched
    // Activity's onCreate — the outgoing Activity has already paused, but the new one hasn't
    // resumed yet). Flushed as soon as the next Activity resumes.
    @Volatile private var pendingNotification: InboxNotification? = null

    private val activityLifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            currentActivityRef = WeakReference(activity)
            pendingNotification?.let { notification ->
                pendingNotification = null
                showOnActivity(activity, notification)
            }
        }
        override fun onActivityPaused(activity: Activity) {
            if (currentActivityRef?.get() === activity) currentActivityRef = null
        }
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
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

        // Wire up API logging callback
        ApiLogger.callback = config.onApiLog

        // Strip QA_ prefix and resolve the correct base URL
        val isQa       = config.clientId.startsWith(QA_PREFIX)
        val cleanId    = if (isQa) config.clientId.removePrefix(QA_PREFIX) else config.clientId
        val baseUrl    = if (isQa) QA_BASE_URL else PROD_BASE_URL

        Logger.log("initSDK | env=${if (isQa) "QA" else "PROD"} | baseUrl=$baseUrl")

        // Create the default FCM notification channel early so Firebase-rendered background
        // notifications have a valid channel before the first message arrives (Android 8+).
        createDefaultChannel(context.applicationContext)

        appContext = context.applicationContext

        if (!activityCallbacksRegistered) {
            (appContext as? Application)?.registerActivityLifecycleCallbacks(activityLifecycleCallbacks)
            activityCallbacksRegistered = true
        }

        val deviceService = DeviceService(appContext)

        // Restore persisted FCM token so it's available before setIdentity is called
        val savedToken = Storage.get(appContext, StorageKeys.FCM_TOKEN)

        eventService   = EventService(deviceService)
        identityService = IdentityService()
        notificationInboxService = NotificationInboxService()
        lifecycleService = LifecycleService(
            scope      = scope,
            getState   = { state },
            emit       = { eventName -> emitLifecycleEvent(eventName) },
            checkInbox = { checkInbox() }
        )

        updateState { copy(
            clientId       = cleanId,
            clientSecret   = config.clientSecret,
            baseUrl        = baseUrl,
            userId         = null,
            fcmToken       = savedToken,
            appOpenTracked = false,
            initialized    = true
        )}

        if (savedToken != null) Logger.log("FCM token restored from storage")

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

        // Always report the running platform and that this identity came from the client SDK
        traitsMap["app_platform"] = "android"
        traitsMap["apk_installed_from_client"] = true

        // Persist FCM token so it survives app restarts
        if (fcmToken != null) Storage.set(appContext, StorageKeys.FCM_TOKEN, fcmToken)

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

            // Inbox is per-user — refetch whenever the identified user actually changes. This
            // covers both the cold-start case (current.userId was null) and a later login that
            // switches from an anonymous id to a real user id. app_foreground never fires on a
            // fresh launch, so the cold-start case isn't otherwise covered.
            if (result.success && userId != current.userId) {
                checkInbox()
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

        // on_custom_event evaluation — purely local, no network dependency, so it runs
        // regardless of whether the /events/track call below succeeds.
        if (!current.isInAppPopupVisible) {
            val notification = TriggerEngine.findEligibleNotification(
                current.notificationCache,
                TriggerEvent.CustomEvent(eventName),
                current.handledInAppNotificationIds
            )
            if (notification != null) displayNotification(notification)
        }

        scope.launch {
            val event = eventService.buildEvent(eventName, properties, userId)
            Logger.log("sendEvent: $eventName | event_id=${event.event_id}")
            val result = eventService.trackEvent(event, current.clientId!!, current.clientSecret!!, current.baseUrl)
            callback?.invoke(result)
        }
    }

    // ── Screens & In-App Notifications ───────────────────────────────────────

    /**
     * Call this whenever a screen becomes visible to the user. The SDK stores the current
     * screen, fires the `screen_viewed` analytics event, and evaluates any cached in-app
     * notifications targeting this screen — all without making a network request from this
     * call itself (the inbox is cached from the last [checkInbox] fetch).
     */
    fun trackScreen(screenName: String) {
        if (screenName.isBlank()) {
            Logger.log("trackScreen: screenName must not be blank")
            return
        }
        val current = state
        if (!current.initialized) {
            Logger.log("trackScreen skipped — SDK not initialized")
            return
        }

        val referrer = current.currentScreen
        updateState { copy(previousScreen = current.currentScreen, currentScreen = screenName) }

        val userId = current.userId
        if (!userId.isNullOrBlank() && current.clientId != null && current.clientSecret != null) {
            scope.launch {
                trackDirectEvent("screen_viewed", mapOf("screen_name" to screenName, "referrer" to referrer), userId)
            }
        }

        if (current.isInAppPopupVisible) return // don't stack a popup on rapid navigation

        val notification = TriggerEngine.findEligibleNotification(
            current.notificationCache,
            TriggerEvent.ScreenLoad(screenName),
            current.handledInAppNotificationIds
        )
        if (notification != null) displayNotification(notification)
    }

    // ── Notification Interaction Tracking ────────────────────────────────────

    /**
     * Call this when the user taps a push notification to track the interaction.
     * Fires `notification_opened` (banner tap) or `notification_clicked` (action button tap).
     *
     * Typically called from your Activity's `onNewIntent` or `onCreate` after extracting
     * campaign data from the Intent extras.
     *
     * Example:
     * ```kotlin
     * val campaignId = intent.getStringExtra("campaign_id") ?: return
     * SignalSDK.handleNotificationClick(campaignId = campaignId)
     * ```
     */
    fun handleNotificationClick(
        campaignId: String,
        campaignName: String? = null,
        notificationType: String = "promotional",
        channel: String = "push",
        templateId: String? = null,
        actionId: String? = null,
        deepLink: String? = null,
        notificationTapType: String? = null,
        notificationTapAction1: String? = null,
        notificationTapAction2: String? = null
    ) {
        val current = state
        if (!current.initialized || current.userId.isNullOrBlank()) {
            Logger.log("handleNotificationClick: SDK not ready — skipping push interaction event")
            return
        }

        val eventName = if (actionId != null) "notification_clicked" else "notification_opened"
        val properties = mutableMapOf<String, Any?>(
            "campaign_id"       to campaignId,
            "notification_type" to notificationType,
            "channel"           to channel
        )
        campaignName?.let { properties["campaign_name"] = it }
        templateId?.let   { properties["template_id"]   = it }
        actionId?.let     { properties["action_id"]     = it }
        deepLink?.let     { properties["deep_link"]     = it }
        notificationTapType?.let    { properties["notification_tap_type"]    = it }
        notificationTapAction1?.let { properties["notification_tap_action_1"] = it }
        notificationTapAction2?.let { properties["notification_tap_action_2"] = it }

        Logger.log("handleNotificationClick: $eventName | campaign=$campaignId")
        sendEvent(eventName, properties)
    }

    /**
     * Call this from your `FirebaseMessagingService.onMessageReceived` with the raw FCM
     * `RemoteMessage.getData()` map. Renders one of the SDK's push templates (`standard`,
     * `branded`, `hero_banner` — see docs/push-templates.md) and shows it — the SDK owns
     * building and posting the notification, not just reacting to one already shown.
     *
     * Silently no-ops if `data` doesn't look like a template push (missing `title`/`body`) —
     * safe to call unconditionally from a `FirebaseMessagingService` that also routes other
     * kinds of pushes (chat, MoEngage, etc.) through its own logic.
     *
     * Example:
     * ```kotlin
     * override fun onMessageReceived(message: RemoteMessage) {
     *     SignalSDK.handleRemoteMessage(message.data)
     * }
     * ```
     */
    fun handleRemoteMessage(data: Map<String, String>) {
        if (!this::appContext.isInitialized) {
            Logger.log("handleRemoteMessage: SDK not initialized — skipping")
            return
        }
        val payload = PushNotificationPayload.fromData(data)
        if (payload == null) {
            Logger.log("handleRemoteMessage: no title/body in payload — not a template push, skipping")
            return
        }

        scope.launch(Dispatchers.IO) {
            PushNotificationBuilder.show(appContext, payload)
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private suspend fun emitLifecycleEvent(eventName: String) {
        val current = state
        if (!current.initialized) return
        val userId = current.userId ?: return
        trackDirectEvent(eventName, emptyMap(), userId)
    }

    // Sends an event straight through EventService, bypassing sendEvent()'s on_custom_event
    // trigger check — used for interaction/lifecycle events that must not themselves be able
    // to re-trigger an in-app popup.
    private suspend fun trackDirectEvent(eventName: String, properties: Map<String, Any?>, userId: String) {
        val current = state
        val event = eventService.buildEvent(eventName, properties, userId)
        Logger.log("trackDirectEvent: $eventName | event_id=${event.event_id}")
        eventService.trackEvent(event, current.clientId!!, current.clientSecret!!, current.baseUrl)
    }

    /**
     * Fetches the notification inbox, caches it for [trackScreen]/[sendEvent] trigger checks,
     * and — unless a popup is already showing — evaluates the on_session_start trigger and
     * displays the first eligible match. Called after the first identity is set, whenever the
     * identified user changes, and on every app_foreground.
     */
    private suspend fun checkInbox() {
        val current = state
        val userId = current.userId
        if (!current.initialized || userId.isNullOrBlank() || current.clientId == null || current.clientSecret == null) {
            Logger.log("checkInbox skipped — no active identity")
            return
        }

        try {
            val inbox = notificationInboxService.fetchInbox(userId, current.clientId, current.clientSecret, current.baseUrl)
            Logger.log("checkInbox → ${inbox.notifications.size} notification(s)")
            updateState { copy(notificationCache = inbox.notifications) }

            if (state.isInAppPopupVisible) return // don't stack a popup on top of one already shown

            val notification = TriggerEngine.findEligibleNotification(
                inbox.notifications,
                TriggerEvent.SessionStart,
                state.handledInAppNotificationIds
            )
            if (notification != null) displayNotification(notification)
        } catch (e: Exception) {
            Logger.error("checkInbox failed", e)
        }
    }

    // Shared by the session-start path (checkInbox) and the screen-load/custom-event paths
    // (trackScreen, sendEvent) — marks the notification handled, guards further popups until
    // this one is dismissed, and hands off to the native renderer.
    private fun displayNotification(notification: InboxNotification) {
        updateState {
            copy(
                handledInAppNotificationIds = handledInAppNotificationIds + notification.notification_id,
                isInAppPopupVisible = true
            )
        }

        val activity = currentActivityRef?.get()
        if (activity == null || activity.isFinishing || activity.isDestroyed) {
            // No Activity available right now (e.g. this fired from a new Activity's onCreate,
            // between the outgoing Activity's onPause and this one's onResume) — show it as
            // soon as the next Activity resumes instead of dropping it.
            Logger.log("displayNotification: no current activity yet — queued ${notification.notification_id}")
            pendingNotification = notification
            return
        }

        showOnActivity(activity, notification)
    }

    private fun showOnActivity(activity: Activity, notification: InboxNotification) {
        Logger.log("displayNotification: showing ${notification.notification_id}")
        activity.runOnUiThread {
            InAppPopupOverlay.show(activity, notification, ::onInAppInteraction)
        }
    }

    // Reported back by InAppPopupOverlay for shown/clicked/dismissed. `shown` also marks the
    // notification read; `clicked`/`dismissed` clear the popup-visible guard.
    private fun onInAppInteraction(type: String, notificationId: String, campaignId: String, ctaLabel: String?) {
        val current = state
        val userId = current.userId
        if (userId.isNullOrBlank() || current.clientId == null || current.clientSecret == null) return

        Logger.log("onInAppInteraction: $type | notification=$notificationId")

        when (type) {
            "shown" -> {
                scope.launch {
                    trackDirectEvent(
                        "in_app_notification_viewed",
                        mapOf("notification_id" to notificationId, "campaign_id" to campaignId),
                        userId
                    )
                }
                scope.launch {
                    try {
                        notificationInboxService.markNotificationsRead(
                            listOf(notificationId), userId, current.clientId, current.clientSecret, current.baseUrl
                        )
                    } catch (e: Exception) {
                        Logger.error("markNotificationsRead failed", e)
                    }
                }
            }
            "clicked" -> {
                scope.launch {
                    trackDirectEvent(
                        "in_app_notification_clicked",
                        mapOf("notification_id" to notificationId, "campaign_id" to campaignId, "cta_label" to ctaLabel),
                        userId
                    )
                }
                updateState { copy(isInAppPopupVisible = false) }
            }
            "dismissed" -> {
                scope.launch {
                    trackDirectEvent(
                        "in_app_notification_dismissed",
                        mapOf("notification_id" to notificationId, "campaign_id" to campaignId),
                        userId
                    )
                }
                updateState { copy(isInAppPopupVisible = false) }
            }
        }
    }

    private fun createDefaultChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(DEFAULT_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    DEFAULT_CHANNEL_ID,
                    "Signal Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description  = "Push notifications from Signal"
                    enableLights(true)
                    enableVibration(true)
                }
                nm.createNotificationChannel(channel)
                Logger.log("Notification channel created: $DEFAULT_CHANNEL_ID")
            }
        }
    }

    private fun updateState(update: SDKState.() -> SDKState) {
        synchronized(this) { state = state.update() }
    }
}
