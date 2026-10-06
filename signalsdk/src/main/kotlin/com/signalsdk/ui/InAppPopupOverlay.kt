package com.signalsdk.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.signalsdk.models.InboxNotification
import com.signalsdk.models.NotificationCta
import com.signalsdk.utils.Logger
import java.net.HttpURLConnection
import java.net.URL

/**
 * Renders a single in-app notification as a view attached directly to the host Activity's own
 * content view — never as a separate Activity/Window. Keeping it in-process means the host
 * Activity never pauses while this is shown, avoiding a false foreground/background lifecycle
 * transition that would otherwise cascade into re-triggering the session-start inbox check.
 *
 * `template_type` selects the shape: "full_screen" (covers the whole screen, opaque background),
 * "pop_ups" (centered card over a dim scrim — the shape this SDK originally shipped with only
 * one fixed layout of), "bubble" (small card anchored to the bottom, no scrim — app content stays
 * visible around it). Any other/missing value falls back to [showLegacyImageCard], preserving the
 * exact original image-only behavior for already-scheduled campaigns that predate this field.
 *
 * image/title/body/cta are each shown only when present in the payload — none of the 3 shapes
 * require any particular field, beyond needing at least one of them (enforced upstream by
 * TriggerEngine.hasRenderableContent).
 */
internal object InAppPopupOverlay {

    private var currentRoot: View? = null
    private var backPressedCallback: OnBackPressedCallback? = null
    @Volatile private var popupShowing = false

    private const val DEFAULT_CTA_COLOR = "#2F6BFF"

    fun isShowing(): Boolean = popupShowing

    fun show(
        activity: Activity,
        notification: InboxNotification,
        onInteraction: (
            type: String,
            notificationId: String,
            campaignId: String,
            ctaLabel: String?,
            ctaAction: String?,
            ctaValue: String?
        ) -> Unit
    ) {
        if (popupShowing) {
            Logger.log("InAppPopupOverlay.show skipped — a popup is already showing")
            return
        }

        val notificationId = notification.notification_id
        val campaignId = notification.campaign_id

        if (notification.render_engine == "html") {
            // No WebView-based renderer yet — drop rather than show nothing useful.
            Logger.log("InAppPopupOverlay.show: render_engine=html not supported yet — dismissing $notificationId")
            onInteraction("dismissed", notificationId, campaignId, null, null, null)
            return
        }

        popupShowing = true
        val imageUrl = notification.media?.image_url

        if (imageUrl.isNullOrEmpty()) {
            renderPopup(activity, null, notification, onInteraction)
            return
        }

        Logger.log("InAppPopupOverlay.show: downloading image for $notificationId")
        downloadImage(imageUrl) { bitmap ->
            if (activity.isFinishing || activity.isDestroyed) {
                // Must still resolve via onInteraction — SignalSDK.kt's isInAppPopupVisible is
                // only cleared on a "clicked"/"dismissed" callback. Without this, an Activity
                // finishing mid-download would leave it stuck true forever, silently blocking
                // every later in-app popup for the rest of the process lifetime.
                Logger.log("InAppPopupOverlay.show: activity finished/destroyed before image finished loading for $notificationId")
                popupShowing = false
                onInteraction("dismissed", notificationId, campaignId, null, null, null)
                return@downloadImage
            }
            // A failed download still renders — the template's other fields (title/body/cta)
            // may be enough on their own; only the legacy template requires an image to exist.
            renderPopup(activity, bitmap, notification, onInteraction)
        }
    }

    private fun renderPopup(
        activity: Activity,
        bitmap: Bitmap?,
        notification: InboxNotification,
        onInteraction: (String, String, String, String?, String?, String?) -> Unit
    ) {
        when (notification.template_type) {
            "full_screen" -> showFullScreen(activity, bitmap, notification, onInteraction)
            "pop_ups" -> showCard(activity, bitmap, notification, onInteraction, bubble = false)
            "bubble" -> showCard(activity, bitmap, notification, onInteraction, bubble = true)
            else -> showLegacyImageCard(activity, bitmap, notification, onInteraction)
        }
    }

    private fun downloadImage(imageUrl: String, callback: (Bitmap?) -> Unit) {
        Thread {
            val bitmap: Bitmap? = try {
                val connection = URL(imageUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                connection.doInput = true
                connection.connect()
                BitmapFactory.decodeStream(connection.inputStream)
            } catch (e: Exception) {
                Logger.error("InAppPopupOverlay: image download failed", e)
                null
            }
            Handler(Looper.getMainLooper()).post { callback(bitmap) }
        }.start()
    }

    private fun dpToPx(activity: Activity, dp: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), activity.resources.displayMetrics).toInt()

    private fun parseColorOrNull(hex: String?): Int? =
        hex?.let {
            try {
                Color.parseColor(it)
            } catch (e: IllegalArgumentException) {
                null
            }
        }

    // ── Shared interaction handling ──────────────────────────────────────────────────────

    // One per shown popup — `resolved` is shared across every button/close-tap so only the
    // first interaction is ever reported, whichever element the user happened to tap.
    private class InteractionResolver(
        private val activity: Activity,
        private val notificationId: String,
        private val campaignId: String,
        private val onInteraction: (String, String, String, String?, String?, String?) -> Unit
    ) {
        private var resolved = false

        fun click(cta: NotificationCta) {
            if (resolved) return
            resolved = true
            Logger.log("InAppPopupOverlay: clicked $notificationId (action=${cta.action})")
            onInteraction("clicked", notificationId, campaignId, cta.label, cta.action, cta.value)
            if (cta.action == "external_url" && !cta.value.isNullOrEmpty()) {
                try {
                    activity.startActivity(Intent(activity, InAppWebViewActivity::class.java).apply {
                        putExtra(InAppWebViewActivity.EXTRA_URL, cta.value)
                    })
                } catch (e: Exception) {
                    Logger.error("InAppPopupOverlay: failed to open CTA url", e)
                }
            }
            // "deep_link" is handed to the host app's InAppActionListener by SignalSDK.kt's
            // onInAppInteraction — nothing further to do here.
            dismiss()
        }

        fun dismissByUser() {
            if (resolved) return
            resolved = true
            Logger.log("InAppPopupOverlay: dismissed $notificationId")
            onInteraction("dismissed", notificationId, campaignId, null, null, null)
            dismiss()
        }
    }

    // ── Shared view builders ─────────────────────────────────────────────────────────────

    private fun buildImageView(activity: Activity, bitmap: Bitmap, cornerRadiusDp: Int): FrameLayout {
        val imageView = ImageView(activity).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.CENTER_CROP
        }
        return FrameLayout(activity).apply {
            val radiusPx = dpToPx(activity, cornerRadiusDp).toFloat()
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, radiusPx)
                }
            }
            clipToOutline = true
            addView(imageView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
    }

    private fun buildTitleText(activity: Activity, text: String): TextView = TextView(activity).apply {
        this.text = text
        setTextColor(Color.parseColor("#1A1A1A"))
        textSize = 17f
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        gravity = Gravity.CENTER
        maxLines = 3
    }

    private fun buildBodyText(activity: Activity, text: String): TextView = TextView(activity).apply {
        this.text = text
        setTextColor(Color.parseColor("#6B6B6B"))
        textSize = 15f
        gravity = Gravity.CENTER
        maxLines = 4
    }

    private fun buildCtaRow(
        activity: Activity,
        ctaList: List<NotificationCta>,
        resolver: InteractionResolver
    ): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        val buttonHeight = dpToPx(activity, 44)
        val radiusPx = dpToPx(activity, 8).toFloat()
        ctaList.forEachIndexed { index, cta ->
            val button = TextView(activity).apply {
                text = cta.label.orEmpty()
                setTextColor(Color.WHITE)
                textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    cornerRadius = radiusPx
                    setColor(parseColorOrNull(cta.cta_background_color) ?: Color.parseColor(DEFAULT_CTA_COLOR))
                }
                setOnClickListener { resolver.click(cta) }
            }
            val params = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, buttonHeight)
            if (index > 0) params.topMargin = dpToPx(activity, 8)
            addView(button, params)
        }
    }

    private fun buildCloseButton(activity: Activity, onClick: () -> Unit): FrameLayout {
        val closeSize = dpToPx(activity, 32)
        val barLength = dpToPx(activity, 12)
        val barThickness = dpToPx(activity, 2)
        val barColor = Color.parseColor("#4A4A4A")
        return FrameLayout(activity).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            elevation = dpToPx(activity, 14).toFloat()
            minimumWidth = closeSize
            minimumHeight = closeSize
            addView(
                View(activity).apply { setBackgroundColor(barColor); rotation = 45f },
                FrameLayout.LayoutParams(barLength, barThickness).apply { gravity = Gravity.CENTER },
            )
            addView(
                View(activity).apply { setBackgroundColor(barColor); rotation = -45f },
                FrameLayout.LayoutParams(barLength, barThickness).apply { gravity = Gravity.CENTER },
            )
            setOnClickListener { onClick() }
        }
    }

    private fun attachBackPress(activity: Activity, resolver: InteractionResolver) {
        (activity as? ComponentActivity)?.let { componentActivity ->
            val callback = object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    resolver.dismissByUser()
                }
            }
            componentActivity.onBackPressedDispatcher.addCallback(callback)
            backPressedCallback = callback
        }
    }

    private fun attachAndAnimate(activity: Activity, root: View, vararg fadeInTargets: View) {
        val contentRoot = activity.findViewById<ViewGroup>(android.R.id.content)
        contentRoot.addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        currentRoot = root

        root.animate().alpha(1f).setDuration(180).start()
        fadeInTargets.forEach { target ->
            target.animate()
                .alpha(1f).scaleX(1f).scaleY(1f)
                .setDuration(220)
                .setInterpolator(DecelerateInterpolator())
                .start()
        }
    }

    private fun showCloseButtonFor(notification: InboxNotification): Boolean =
        notification.close_button_visibility != "never"

    // ── Template: full_screen ────────────────────────────────────────────────────────────

    private fun showFullScreen(
        activity: Activity,
        bitmap: Bitmap?,
        notification: InboxNotification,
        onInteraction: (String, String, String, String?, String?, String?) -> Unit
    ) {
        val resolver = InteractionResolver(activity, notification.notification_id, notification.campaign_id, onInteraction)

        val root = FrameLayout(activity).apply {
            setBackgroundColor(parseColorOrNull(notification.media?.background_color) ?: Color.WHITE)
            alpha = 0f
        }

        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            val pad = dpToPx(activity, 24)
            setPadding(pad, pad, pad, pad)
        }

        if (bitmap != null) {
            val imageHeight = (activity.resources.displayMetrics.heightPixels * 0.35).toInt()
            content.addView(
                buildImageView(activity, bitmap, cornerRadiusDp = 0),
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, imageHeight).apply {
                    bottomMargin = dpToPx(activity, 24)
                }
            )
        }
        notification.title?.takeIf { it.isNotEmpty() }?.let {
            content.addView(buildTitleText(activity, it), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dpToPx(activity, 12)
            })
        }
        notification.body?.takeIf { it.isNotEmpty() }?.let {
            content.addView(buildBodyText(activity, it), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dpToPx(activity, 28)
            })
        }
        val ctaList = notification.cta.orEmpty()
        if (ctaList.isNotEmpty()) {
            content.addView(buildCtaRow(activity, ctaList, resolver), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        // With an image, the 45%-height image anchors the block near the top and centering the
        // whole thing reads as balanced. Without one, centering leaves a large empty gap above
        // the title — anchor to the top (clearing the close button) instead in that case.
        root.addView(content, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            if (bitmap != null) {
                gravity = Gravity.CENTER
            } else {
                gravity = Gravity.TOP
                topMargin = dpToPx(activity, 96)
            }
        })

        if (showCloseButtonFor(notification)) {
            val closeButton = buildCloseButton(activity) { resolver.dismissByUser() }
            root.addView(closeButton, FrameLayout.LayoutParams(dpToPx(activity, 32), dpToPx(activity, 32)).apply {
                gravity = Gravity.TOP or Gravity.END
                topMargin = dpToPx(activity, 40)
                rightMargin = dpToPx(activity, 16)
            })
        }

        attachBackPress(activity, resolver)
        attachAndAnimate(activity, root)

        Logger.log("InAppPopupOverlay: shown ${notification.notification_id} (full_screen)")
        onInteraction("shown", notification.notification_id, notification.campaign_id, null, null, null)
    }

    // ── Templates: pop_ups / bubble (share the same "card" shape, different size/position) ──

    private fun showCard(
        activity: Activity,
        bitmap: Bitmap?,
        notification: InboxNotification,
        onInteraction: (String, String, String, String?, String?, String?) -> Unit,
        bubble: Boolean
    ) {
        val resolver = InteractionResolver(activity, notification.notification_id, notification.campaign_id, onInteraction)

        val root = FrameLayout(activity).apply {
            // pop_ups dims the app behind the card; bubble leaves it visible/interactive —
            // an undecorated FrameLayout with no background/click listener doesn't intercept
            // touches outside its children, so the host app stays usable around the bubble.
            if (!bubble) {
                setBackgroundColor(Color.parseColor("#A6000000"))
            }
            alpha = 0f
        }

        val screenWidth = activity.resources.displayMetrics.widthPixels
        val cardWidth = if (bubble) minOf((screenWidth * 0.9).toInt(), dpToPx(activity, 360)) else (screenWidth * 0.85).toInt()

        val card = FrameLayout(activity).apply {
            background = GradientDrawable().apply {
                cornerRadius = dpToPx(activity, 16).toFloat()
                setColor(parseColorOrNull(notification.media?.background_color) ?: Color.WHITE)
            }
            clipToOutline = true
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, dpToPx(activity, 16).toFloat())
                }
            }
            elevation = dpToPx(activity, 12).toFloat()
            scaleX = 0.92f
            scaleY = 0.92f
            alpha = 0f
        }

        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dpToPx(activity, 16)
            setPadding(pad, pad, pad, pad)
        }

        if (bitmap != null) {
            content.addView(
                buildImageView(activity, bitmap, cornerRadiusDp = 10),
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(activity, if (bubble) 100 else 140)).apply {
                    bottomMargin = dpToPx(activity, 12)
                }
            )
        }
        notification.title?.takeIf { it.isNotEmpty() }?.let {
            content.addView(buildTitleText(activity, it), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dpToPx(activity, 10)
            })
        }
        notification.body?.takeIf { it.isNotEmpty() }?.let {
            content.addView(buildBodyText(activity, it), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dpToPx(activity, 18)
            })
        }
        val ctaList = notification.cta.orEmpty()
        if (ctaList.isNotEmpty()) {
            content.addView(buildCtaRow(activity, ctaList, resolver), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        card.addView(content, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        // Anchored to the card's own top-end corner (not computed from root/screen coordinates)
        // so it stays correctly placed regardless of the card's final wrap-content size.
        if (showCloseButtonFor(notification)) {
            val closeButton = buildCloseButton(activity) { resolver.dismissByUser() }
            card.addView(closeButton, FrameLayout.LayoutParams(dpToPx(activity, 28), dpToPx(activity, 28)).apply {
                gravity = Gravity.TOP or Gravity.END
                topMargin = dpToPx(activity, 8)
                rightMargin = dpToPx(activity, 8)
            })
        }

        val cardParams = FrameLayout.LayoutParams(cardWidth, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = if (bubble) Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL else Gravity.CENTER
            if (bubble) bottomMargin = dpToPx(activity, 24)
        }
        root.addView(card, cardParams)
        attachAndAnimate(activity, root, card)

        attachBackPress(activity, resolver)

        Logger.log("InAppPopupOverlay: shown ${notification.notification_id} (${if (bubble) "bubble" else "pop_ups"})")
        onInteraction("shown", notification.notification_id, notification.campaign_id, null, null, null)
    }

    // ── Legacy fallback — unchanged behavior for null/unrecognized template_type ─────────

    private fun showLegacyImageCard(
        activity: Activity,
        bitmap: Bitmap?,
        notification: InboxNotification,
        onInteraction: (String, String, String, String?, String?, String?) -> Unit
    ) {
        if (bitmap == null) {
            Logger.log("InAppPopupOverlay.showLegacyImageCard: no image — dismissing ${notification.notification_id}")
            popupShowing = false
            onInteraction("dismissed", notification.notification_id, notification.campaign_id, null, null, null)
            return
        }

        val resolver = InteractionResolver(activity, notification.notification_id, notification.campaign_id, onInteraction)
        val cornerRadiusPx = dpToPx(activity, 16).toFloat()

        val root = FrameLayout(activity).apply {
            setBackgroundColor(Color.parseColor("#A6000000"))
            alpha = 0f
        }

        val screenWidth = activity.resources.displayMetrics.widthPixels
        val screenHeight = activity.resources.displayMetrics.heightPixels
        val cardWidth = (screenWidth * 0.85).toInt()
        val cardHeight = (cardWidth.toFloat() * bitmap.height / bitmap.width).toInt()
        val cardLeft = (screenWidth - cardWidth) / 2
        val cardTop = (screenHeight - cardHeight) / 2

        val card = FrameLayout(activity).apply {
            elevation = dpToPx(activity, 12).toFloat()
            scaleX = 0.92f
            scaleY = 0.92f
            alpha = 0f
        }
        val cardParams = FrameLayout.LayoutParams(cardWidth, cardHeight).apply { gravity = Gravity.CENTER }

        // The single legacy CTA (if any) — tapping the whole image acts as this button, since
        // this layout predates having a visible button row at all.
        val legacyCta = notification.cta?.firstOrNull() ?: NotificationCta(
            role = null, label = null, action = "dismiss", value = null, cta_background_color = null
        )
        val imageView = ImageView(activity).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.FIT_CENTER
            adjustViewBounds = true
            setOnClickListener { resolver.click(legacyCta) }
        }

        val clipContainer = FrameLayout(activity).apply {
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, cornerRadiusPx)
                }
            }
            clipToOutline = true
            addView(imageView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        card.addView(clipContainer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        root.addView(card, cardParams)

        if (showCloseButtonFor(notification)) {
            val closeButton = buildCloseButton(activity) { resolver.dismissByUser() }.apply {
                alpha = 0f
                scaleX = 0.92f
                scaleY = 0.92f
            }
            val closeSize = dpToPx(activity, 32)
            val closeParams = FrameLayout.LayoutParams(closeSize, closeSize).apply {
                gravity = Gravity.TOP or Gravity.START
                leftMargin = cardLeft + cardWidth - closeSize / 2
                topMargin = cardTop - closeSize / 2
            }
            root.addView(closeButton, closeParams)
            attachAndAnimate(activity, root, card, closeButton)
        } else {
            attachAndAnimate(activity, root, card)
        }

        attachBackPress(activity, resolver)

        Logger.log("InAppPopupOverlay: shown ${notification.notification_id} (legacy)")
        onInteraction("shown", notification.notification_id, notification.campaign_id, null, null, null)
    }

    private fun dismiss() {
        popupShowing = false
        backPressedCallback?.remove()
        backPressedCallback = null
        currentRoot?.let { (it.parent as? ViewGroup)?.removeView(it) }
        currentRoot = null
    }
}
