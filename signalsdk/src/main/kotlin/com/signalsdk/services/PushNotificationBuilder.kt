package com.signalsdk.services

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.signalsdk.SignalSDK
import com.signalsdk.models.PushNotificationPayload
import com.signalsdk.utils.Logger
import java.net.HttpURLConnection
import java.net.URL

// Builds and shows the campaign-push notification described by a PushNotificationPayload.
// Owns the "SDK renders the push" half of the feature — SignalSDK.handleNotificationClick
// remains the tap-tracking half, called separately by the host app.
internal object PushNotificationBuilder {

    private const val IMAGE_TIMEOUT_MS = 10_000
    // Guard against a misconfigured/huge image stalling the notification — matches the rough
    // ceiling both platforms silently drop oversized push images at, per the template spec.
    private const val MAX_IMAGE_BYTES = 5 * 1024 * 1024

    fun show(context: Context, payload: PushNotificationPayload, smallIconResId: Int, defaultNotificationColor: Int?) {
        val notificationManager = NotificationManagerCompat.from(context)

        // Never use context.applicationInfo.icon here — Android force-renders the small icon as
        // a flat monochrome silhouette from its alpha channel, which mangles a full-color
        // launcher icon into an unrecognizable blob. smallIconResId is resolved once in
        // SignalSDK.initSDK from SignalConfig.smallIconResId or the "ic_notification_icon"
        // naming convention; android.R.drawable.ic_dialog_info is the last-resort fallback if
        // neither is available.
        val icon = smallIconResId.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info

        val builder = NotificationCompat.Builder(context, SignalSDK.DEFAULT_CHANNEL_ID)
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setSmallIcon(icon)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)

        // Tints the small icon's badge/chip + app-name text (NOT the notification background —
        // Android reserves setColorized(true) for MediaStyle/CallStyle only). accentColorHex is
        // scoped to "branded" only, same as largeIconUrl/imageUrl are scoped to their own
        // template — a "standard" push can't reach into another template's fields. The
        // SignalConfig.notificationColorResId default, in contrast, is intentionally global
        // (matches MoEngage's notificationColorResource, which applies to every notification).
        val brandedAccentColorHex = payload.accentColorHex.takeIf { payload.template == "branded" }
        resolveColor(brandedAccentColorHex, defaultNotificationColor)?.let { color ->
            builder.color = color
            builder.setColorized(false)
        }

        when (payload.template) {
            "branded" -> applyBranded(builder, payload)
            "hero_banner" -> applyHeroBanner(builder, payload)
            else -> Unit // "standard" (and any unrecognized template) — title/body only
        }

        if (payload.notificationTapType == "dismiss") {
            // No content intent — tapping just clears the notification, nothing launches.
            Logger.log("PushNotificationBuilder: dismiss-only tap, no content intent")
        } else {
            builder.setContentIntent(buildContentIntent(context, payload))
        }

        try {
            notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted (Android 13+) — nothing we can do from here.
            Logger.error("PushNotificationBuilder: notification permission not granted", e)
        }
    }

    // accentColorHex wins when present and valid; falls back to the configured default;
    // null if neither is set (no color applied — system default).
    private fun resolveColor(accentColorHex: String?, defaultNotificationColor: Int?): Int? {
        accentColorHex?.let { hex ->
            try {
                return Color.parseColor(hex)
            } catch (e: IllegalArgumentException) {
                Logger.error("PushNotificationBuilder: invalid accentColorHex '$hex'", e)
            }
        }
        return defaultNotificationColor
    }

    private fun applyBranded(builder: NotificationCompat.Builder, payload: PushNotificationPayload) {
        payload.largeIconUrl?.let { url ->
            downloadBitmap(url)?.let { builder.setLargeIcon(it) }
        }
    }

    private fun applyHeroBanner(builder: NotificationCompat.Builder, payload: PushNotificationPayload) {
        val imageUrl = payload.imageUrl ?: return
        val bitmap = downloadBitmap(imageUrl) ?: return // silent fallback to plain text, per spec
        builder.setStyle(
            NotificationCompat.BigPictureStyle()
                .bigPicture(bitmap)
                .bigLargeIcon(null as Bitmap?)
        )
    }

    private fun buildContentIntent(context: Context, payload: PushNotificationPayload): PendingIntent? {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        launchIntent.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("campaign_id", payload.campaignId)
            putExtra("campaign_name", payload.campaignName)
            putExtra("notification_type", payload.notificationType ?: "promotional")
            putExtra("channel", payload.channel ?: "push")
            putExtra("template_id", payload.templateId)
            putExtra("action_id", payload.actionId)
            putExtra("deep_link", payload.deepLink)
            putExtra("notification_tap_type", payload.notificationTapType)
            putExtra("notification_tap_action_1", payload.notificationTapAction1)
            putExtra("notification_tap_action_2", payload.notificationTapAction2)
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

        return PendingIntent.getActivity(context, System.currentTimeMillis().toInt(), launchIntent, flags)
    }

    // Best-effort synchronous download — caller already runs off the main thread
    // (SignalSDK.handleRemoteMessage dispatches via the SDK's coroutine scope on Dispatchers.IO).
    private fun downloadBitmap(url: String): Bitmap? {
        return try {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = IMAGE_TIMEOUT_MS
                readTimeout = IMAGE_TIMEOUT_MS
                doInput = true
            }
            connection.connect()

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                Logger.log("PushNotificationBuilder: image fetch failed, HTTP ${connection.responseCode}")
                return null
            }
            if (connection.contentLength > MAX_IMAGE_BYTES) {
                Logger.log("PushNotificationBuilder: image too large (${connection.contentLength} bytes), skipping")
                return null
            }

            connection.inputStream.use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) {
            Logger.error("PushNotificationBuilder: image download failed for $url", e)
            null
        }
    }
}
