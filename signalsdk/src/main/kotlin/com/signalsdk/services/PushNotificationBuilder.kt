package com.signalsdk.services

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.signalsdk.R
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

        // accentColorHex is scoped to "branded" only, same as largeIconUrl/imageUrl are scoped
        // to their own template — a "standard" push can't reach into another template's fields.
        // The SignalConfig.notificationColorResId default, in contrast, is intentionally global
        // (matches MoEngage's notificationColorResource, which applies to every notification).
        val brandedAccentColorHex = payload.accentColorHex.takeIf { payload.template == "branded" }
        val resolvedColor = resolveColor(brandedAccentColorHex, defaultNotificationColor)

        val remoteViews = when (payload.template) {
            "standard" -> buildStandardView(context, payload)
            "branded" -> buildBrandedView(context, payload, resolvedColor)
            "hero_banner" -> buildHeroBannerView(context, payload)
            else -> {
                Logger.log(
                    "PushNotificationBuilder: unrecognized template '${payload.template}' — rendering as " +
                        "standard (title/body only). Expected exactly \"standard\", \"branded\", or " +
                        "\"hero_banner\" — check for typos/spacing (e.g. \"hero banner\" vs \"hero_banner\")."
                )
                buildStandardView(context, payload)
            }
        }

        val builder = NotificationCompat.Builder(context, SignalSDK.DEFAULT_CHANNEL_ID)
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setSmallIcon(icon)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // Custom layouts (RemoteViews) replace the body content area only —
            // DecoratedCustomViewStyle keeps the standard system chrome (small icon badge, app
            // name, timestamp, expand affordance) rendering normally above/around it.
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(remoteViews)
            .setCustomBigContentView(remoteViews)

        // Tints the small icon's badge/chip + app-name text in the standard chrome above the
        // custom content (NOT the notification background — Android reserves setColorized(true)
        // for MediaStyle/CallStyle only). The branded template's custom layout gets this same
        // color as a real background fill separately, in buildBrandedView.
        resolvedColor?.let { color ->
            builder.color = color
            builder.setColorized(false)
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

    private fun buildStandardView(context: Context, payload: PushNotificationPayload): RemoteViews {
        return RemoteViews(context.packageName, R.layout.wynta_notification_standard).apply {
            setTextViewText(R.id.wynta_title, payload.title)
            setTextViewText(R.id.wynta_body, payload.body)
        }
    }

    private fun buildBrandedView(context: Context, payload: PushNotificationPayload, resolvedColor: Int?): RemoteViews {
        return RemoteViews(context.packageName, R.layout.wynta_notification_branded).apply {
            setTextViewText(R.id.wynta_title, payload.title)
            setTextViewText(R.id.wynta_body, payload.body)
            // A real background fill — unlike the builder-level .color (icon badge/app-name
            // tint only), this actually colors the card, since we own this layout's root view.
            resolvedColor?.let { setInt(R.id.wynta_root, "setBackgroundColor", it) }
            payload.largeIconUrl?.let { url ->
                downloadBitmap(url)?.let { bitmap ->
                    setImageViewBitmap(R.id.wynta_large_icon, bitmap)
                    setViewVisibility(R.id.wynta_large_icon, View.VISIBLE)
                }
            }
        }
    }

    // Image fills the card with title/body overlaid at the bottom on a gradient scrim, matching
    // the composer's Hero Banner mockup. Falls back to the plain standard layout if the image
    // can't be downloaded — an empty FrameLayout with white overlay text and nothing behind it
    // would be unreadable, so this isn't a "hero_banner minus the image", it's a different layout.
    private fun buildHeroBannerView(context: Context, payload: PushNotificationPayload): RemoteViews {
        val bitmap = payload.imageUrl?.let { downloadBitmap(it) }
            ?: return buildStandardView(context, payload) // silent fallback, per spec

        return RemoteViews(context.packageName, R.layout.wynta_notification_hero_banner).apply {
            setTextViewText(R.id.wynta_title, payload.title)
            setTextViewText(R.id.wynta_body, payload.body)
            setImageViewBitmap(R.id.wynta_hero_image, bitmap)
        }
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
