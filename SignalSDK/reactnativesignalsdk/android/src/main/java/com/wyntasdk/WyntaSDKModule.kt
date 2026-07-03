package com.wyntasdk

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.app.NotificationManager
import android.app.NotificationChannel
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat

class WyntaSDKModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        // Must match the default_notification_channel_id declared in the host app's AndroidManifest.xml
        const val CHANNEL_ID = "signal_default"
    }

    private var coldStartNotification: WritableMap? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String {
        return "WyntaSDKModule"
    }

    override fun initialize() {
        super.initialize()
        createDefaultChannel()
        val activity = reactApplicationContext.currentActivity
        if (activity != null) {
            handleIntent(activity.intent, isColdStart = true)
        }
    }

    private fun createDefaultChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Signal Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Push notifications from Signal"
                    enableLights(true)
                    enableVibration(true)
                }
                nm.createNotificationChannel(channel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        handleIntent(intent, isColdStart = false)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        // No-op
    }

    private fun handleIntent(intent: Intent?, isColdStart: Boolean) {
        if (intent == null) return
        val extras = intent.extras ?: return

        val campaignId = extras.getString("campaign_id") ?: extras.getString("wynta_campaign_id")
        if (campaignId != null) {
            val params = Arguments.createMap()
            params.putString("campaign_id", campaignId)
            params.putString("campaign_name", extras.getString("campaign_name"))
            params.putString("notification_type", extras.getString("notification_type") ?: "promotional")
            params.putString("channel", extras.getString("channel") ?: "push")
            params.putString("template_id", extras.getString("template_id"))
            params.putString("action_id", extras.getString("action_id"))
            params.putString("deep_link", extras.getString("deep_link"))
            params.putBoolean("is_cold_start", isColdStart)

            if (isColdStart) {
                coldStartNotification = params
            }

            sendEvent("wynta_push_interaction", params)
        }
    }

    @ReactMethod
    fun getColdStartNotification(promise: Promise) {
        var notification = coldStartNotification

        if (notification == null) {
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                val extras = activity.intent?.extras
                if (extras != null) {
                    val campaignId = extras.getString("campaign_id") ?: extras.getString("wynta_campaign_id")
                    if (campaignId != null) {
                        val params = Arguments.createMap()
                        params.putString("campaign_id", campaignId)
                        params.putString("campaign_name", extras.getString("campaign_name"))
                        params.putString("notification_type", extras.getString("notification_type") ?: "promotional")
                        params.putString("channel", extras.getString("channel") ?: "push")
                        params.putString("template_id", extras.getString("template_id"))
                        params.putString("action_id", extras.getString("action_id"))
                        params.putString("deep_link", extras.getString("deep_link"))
                        params.putBoolean("is_cold_start", true)
                        notification = params
                    }
                }
            }
        }

        if (notification != null) {
            coldStartNotification = null
            try {
                val activity = reactApplicationContext.currentActivity
                activity?.intent?.removeExtra("campaign_id")
                activity?.intent?.removeExtra("wynta_campaign_id")
            } catch (e: Exception) {
                // Ignore
            }
            promise.resolve(notification)
        } else {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getStoredString(key: String, promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences("signal_sdk_prefs", Context.MODE_PRIVATE)
            val value = sharedPref.getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setStoredString(key: String, value: String, promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences("signal_sdk_prefs", Context.MODE_PRIVATE)
            sharedPref.edit().putString(key, value).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun removeStoredString(key: String, promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences("signal_sdk_prefs", Context.MODE_PRIVATE)
            sharedPref.edit().remove(key).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    private fun getSafeString(map: ReadableMap, key: String): String? {
        return if (map.hasKey(key) && !map.isNull(key) && map.getType(key) == ReadableType.String) {
            map.getString(key)
        } else {
            null
        }
    }

    @ReactMethod
    fun showNotification(title: String, body: String, data: ReadableMap) {
        val context = reactApplicationContext
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val packageName = context.packageName

        // Ensure channel exists — belt-and-suspenders in case initialize() hasn't run yet
        // (e.g. headless background task on first launch)
        createDefaultChannel()

        // Build optional tap intent — notification is shown regardless
        val launchIntent = try {
            context.packageManager.getLaunchIntentForPackage(packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                val campaignId = getSafeString(data, "campaign_id") ?: getSafeString(data, "wynta_campaign_id")
                if (campaignId != null) {
                    putExtra("campaign_id",       campaignId)
                    putExtra("wynta_campaign_id",  campaignId)
                    putExtra("campaign_name",      getSafeString(data, "campaign_name"))
                    putExtra("notification_type",  getSafeString(data, "notification_type") ?: "promotional")
                    putExtra("channel",            "push")
                    putExtra("template_id",        getSafeString(data, "template_id"))
                    putExtra("action_id",          getSafeString(data, "action_id"))
                    putExtra("deep_link",          getSafeString(data, "deep_link"))
                }
            }
        } catch (e: Exception) { null }

        val pendingIntent = launchIntent?.let {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            else
                PendingIntent.FLAG_UPDATE_CURRENT
            PendingIntent.getActivity(context, System.currentTimeMillis().toInt(), it, flags)
        }

        val smallIcon = try {
            val info = context.packageManager.getApplicationInfo(packageName, 0)
            if (info.icon != 0) info.icon else android.R.drawable.ic_dialog_info
        } catch (e: Exception) { android.R.drawable.ic_dialog_info }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIcon)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .apply { pendingIntent?.let { setContentIntent(it) } }

        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }
}
