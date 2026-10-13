package com.signalsdk.services

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.util.TypedValue
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

    // Assumed notification content width used only to convert a downloaded hero image's aspect
    // ratio into a height — an approximation (real width varies by device/density and isn't
    // queryable from RemoteViews), clamped so an extreme source aspect ratio can't produce a
    // sliver-thin or absurdly tall notification.
    private const val REFERENCE_WIDTH_DP = 340f
    private const val MIN_HERO_HEIGHT_DP = 120f
    private const val MAX_HERO_HEIGHT_DP = 220f

    // Rich images are downscaled to this width before going into the RemoteViews (a full-size
    // photo can exceed the notification's binder transaction limit), then given rounded corners
    // to match the composer preview's card.
    private const val MAX_RICH_IMAGE_WIDTH_PX = 1080
    private const val RICH_IMAGE_CORNER_DP = 8f

    fun show(context: Context, payload: PushNotificationPayload, smallIconResId: Int, defaultNotificationColor: Int?) {
        val notificationManager = NotificationManagerCompat.from(context)

        // Never use context.applicationInfo.icon here — Android force-renders the small icon as
        // a flat monochrome silhouette from its alpha channel, which mangles a full-color
        // launcher icon into an unrecognizable blob. smallIconResId is resolved once in
        // SignalSDK.initSDK from SignalConfig.smallIconResId or the "ic_notification_icon"
        // naming convention; android.R.drawable.ic_dialog_info is the last-resort fallback if
        // neither is available.
        val icon = smallIconResId.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info

        // accentColorHex is scoped to "branded" only, same as imageUrl/richImageUrl are scoped
        // to their own template — a "standard" push can't reach into another template's fields.
        // The SignalConfig.notificationColorResId default, in contrast, is intentionally global
        // (matches MoEngage's notificationColorResource, which applies to every notification).
        val brandedAccentColorHex = payload.accentColorHex.takeIf { payload.template == "branded" }
        val resolvedColor = resolveColor(brandedAccentColorHex, defaultNotificationColor)

        val template = when (payload.template) {
            "standard", "branded", "hero_banner" -> payload.template
            else -> {
                Logger.log(
                    "PushNotificationBuilder: unrecognized template '${payload.template}' — rendering as " +
                        "standard (title/body only). Expected exactly \"standard\", \"branded\", or " +
                        "\"hero_banner\" — check for typos/spacing (e.g. \"hero banner\" vs \"hero_banner\")."
                )
                "standard"
            }
        }

        // The rich image is "standard"/"branded" only, and only in the expanded view: the
        // collapsed view is capped at ~64dp, so it gets the same layout without the image.
        // Downloaded once here so both views don't fetch it. A failed download just means no image.
        val richImage = payload.richImageUrl
            ?.takeIf { template == "standard" || template == "branded" }
            ?.let { downloadBitmap(it) }
            ?.let { prepareRichImage(context, it) }

        fun buildView(withRichImage: Boolean): RemoteViews {
            val image = richImage.takeIf { withRichImage }
            val views = when (template) {
                "branded" -> buildBrandedView(context, payload, resolvedColor, image)
                "hero_banner" -> buildHeroBannerView(context, payload)
                else -> buildStandardView(context, payload, image)
            }
            // Unlike accentColorHex/imageUrl/richImageUrl (scoped to their templates), textColor
            // applies to the title/body on all three — wynta_title/wynta_body are the same view
            // IDs across all three layout XMLs, so this is applied here rather than per builder.
            payload.textColor?.let { hex ->
                try {
                    val color = Color.parseColor(hex)
                    views.setTextColor(R.id.wynta_title, color)
                    views.setTextColor(R.id.wynta_body, color)
                } catch (e: IllegalArgumentException) {
                    Logger.error("PushNotificationBuilder: invalid textColor '$hex'", e)
                }
            }
            return views
        }

        val expandedView = buildView(withRichImage = true)
        val collapsedView = if (richImage != null) buildView(withRichImage = false) else expandedView

        val builder = NotificationCompat.Builder(context, SignalSDK.DEFAULT_CHANNEL_ID)
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setSmallIcon(icon)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCustomContentView(collapsedView)
            .setCustomBigContentView(expandedView)

        // "branded" skips DecoratedCustomViewStyle so its colored root goes fully edge-to-edge,
        // matching the composer mockup's full-bleed card — DecoratedCustomViewStyle insets custom
        // content to match the system template's standard margins, which would eat into the
        // colored area. The mandatory Android 12+ app-identity strip (icon/name/timestamp) still
        // renders above the card regardless — that's a separate, always-on system layer with no
        // opt-out, not something DecoratedCustomViewStyle controls. standard/hero_banner keep
        // DecoratedCustomViewStyle since their mockups don't need edge-to-edge color.
        if (template != "branded") {
            builder.setStyle(NotificationCompat.DecoratedCustomViewStyle())
        }

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

    private fun buildStandardView(context: Context, payload: PushNotificationPayload, richImage: Bitmap?): RemoteViews {
        return RemoteViews(context.packageName, R.layout.wynta_notification_standard).apply {
            setTextViewText(R.id.wynta_title, payload.title)
            setTextViewText(R.id.wynta_body, payload.body)
            setRichImage(richImage)
        }
    }

    private fun buildBrandedView(
        context: Context,
        payload: PushNotificationPayload,
        resolvedColor: Int?,
        richImage: Bitmap?
    ): RemoteViews {
        return RemoteViews(context.packageName, R.layout.wynta_notification_branded).apply {
            setTextViewText(R.id.wynta_title, payload.title)
            setTextViewText(R.id.wynta_body, payload.body)
            // A real background fill — unlike the builder-level .color (icon badge/app-name
            // tint only), this actually colors the card, since we own this layout's root view.
            // wynta_root's XML background is the rounded-rect wynta_branded_bg drawable; on
            // API 31+ we retint it in place via setBackgroundTintList (keeps rounded corners).
            // RemoteViews has no drawable-tint entry point pre-31, so older devices fall back
            // to replacing the background outright with a flat color (correct color, square
            // corners) rather than showing wynta_branded_bg's fixed placeholder color.
            resolvedColor?.let { color ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setColorStateList(R.id.wynta_root, "setBackgroundTintList", ColorStateList.valueOf(color))
                } else {
                    setInt(R.id.wynta_root, "setBackgroundColor", color)
                }
            }
            setRichImage(richImage)
        }
    }

    // wynta_rich_image is gone in the XML; shown only when there's an image for this view.
    private fun RemoteViews.setRichImage(bitmap: Bitmap?) {
        bitmap ?: return
        setImageViewBitmap(R.id.wynta_rich_image, bitmap)
        setViewVisibility(R.id.wynta_rich_image, View.VISIBLE)
    }

    // Downscales to MAX_RICH_IMAGE_WIDTH_PX and rounds the corners (RemoteViews can't clip an
    // ImageView to a shape, so the corners are baked into the bitmap).
    private fun prepareRichImage(context: Context, source: Bitmap): Bitmap {
        val scaled = if (source.width > MAX_RICH_IMAGE_WIDTH_PX) {
            val height = (source.height * MAX_RICH_IMAGE_WIDTH_PX.toFloat() / source.width).toInt().coerceAtLeast(1)
            Bitmap.createScaledBitmap(source, MAX_RICH_IMAGE_WIDTH_PX, height, true)
        } else source

        // Radius is relative to the bitmap, which is drawn at roughly notification width — scale
        // the dp radius by how much wider the bitmap is than that, so corners look ~8dp on screen.
        val density = context.resources.displayMetrics.density
        val radius = RICH_IMAGE_CORNER_DP * scaled.width / (REFERENCE_WIDTH_DP * density)

        val rounded = Bitmap.createBitmap(scaled.width, scaled.height, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        }
        Canvas(rounded).drawRoundRect(RectF(0f, 0f, scaled.width.toFloat(), scaled.height.toFloat()), radius, radius, paint)
        return rounded
    }

    // Image fills the card with title/body overlaid directly at the bottom, matching the
    // composer's Hero Banner mockup. Falls back to the plain standard layout if the image
    // can't be downloaded — an empty FrameLayout with white overlay text and nothing behind it
    // would be unreadable, so this isn't a "hero_banner minus the image", it's a different layout.
    private fun buildHeroBannerView(context: Context, payload: PushNotificationPayload): RemoteViews {
        val bitmap = payload.imageUrl?.let { downloadBitmap(it) }
            ?: return buildStandardView(context, payload, null) // silent fallback, per spec

        return RemoteViews(context.packageName, R.layout.wynta_notification_hero_banner).apply {
            setTextViewText(R.id.wynta_title, payload.title)
            setTextViewText(R.id.wynta_body, payload.body)
            setImageViewBitmap(R.id.wynta_hero_image, bitmap)

            // The XML's fixed 200dp height is a fallback for API < 31, where RemoteViews can't be
            // resized at runtime. centerCrop scales to fill both dimensions and crops whatever
            // overflows — a fixed height mismatched against a campaign image's real aspect ratio
            // (e.g. a wide banner into a relatively-tall 200dp box) crops real content off the
            // left/right edges. On API 31+ we size the container to the actual downloaded image's
            // aspect ratio instead, so it displays uncropped (clamped to a sane range so an
            // extreme aspect ratio doesn't produce a sliver or a wall of a notification).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val aspectRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
                val heightDp = (REFERENCE_WIDTH_DP / aspectRatio).coerceIn(MIN_HERO_HEIGHT_DP, MAX_HERO_HEIGHT_DP)
                setViewLayoutHeight(R.id.wynta_root, heightDp, TypedValue.COMPLEX_UNIT_DIP)
            }
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
