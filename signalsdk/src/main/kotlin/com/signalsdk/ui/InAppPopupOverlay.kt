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
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.signalsdk.models.InboxNotification
import com.signalsdk.utils.Logger
import java.net.HttpURLConnection
import java.net.URL

/**
 * Renders a single in-app notification (image + tappable CTA baked into the image, plus a
 * close button) as a view attached directly to the host Activity's own content view — never
 * as a separate Activity/Window. Keeping it in-process means the host Activity never pauses
 * while this is shown, avoiding a false foreground/background lifecycle transition that would
 * otherwise cascade into re-triggering the session-start inbox check. Ported from the React
 * Native SDK's android/InAppPopupOverlay.kt.
 */
internal object InAppPopupOverlay {

    private var currentRoot: View? = null
    private var backPressedCallback: OnBackPressedCallback? = null
    @Volatile private var popupShowing = false

    fun isShowing(): Boolean = popupShowing

    fun show(
        activity: Activity,
        notification: InboxNotification,
        onInteraction: (type: String, notificationId: String, campaignId: String, ctaLabel: String?) -> Unit
    ) {
        if (popupShowing) {
            Logger.log("InAppPopupOverlay.show skipped — a popup is already showing")
            return
        }

        val notificationId = notification.notification_id
        val campaignId = notification.campaign_id
        val imageUrl = notification.media?.image_url
        val cta = notification.cta?.firstOrNull()

        if (imageUrl.isNullOrEmpty()) {
            Logger.log("InAppPopupOverlay.show: no image_url — dismissing $notificationId")
            onInteraction("dismissed", notificationId, campaignId, null)
            return
        }

        popupShowing = true
        Logger.log("InAppPopupOverlay.show: downloading image for $notificationId")

        downloadImage(imageUrl) { bitmap ->
            if (activity.isFinishing || activity.isDestroyed) {
                popupShowing = false
                return@downloadImage
            }
            if (bitmap != null) {
                showPopup(activity, bitmap, notificationId, campaignId, cta?.label, cta?.action ?: "dismiss", cta?.value, onInteraction)
            } else {
                Logger.log("InAppPopupOverlay.show: image download failed for $notificationId")
                popupShowing = false
                onInteraction("dismissed", notificationId, campaignId, null)
            }
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

    private fun showPopup(
        activity: Activity,
        bitmap: Bitmap,
        notificationId: String,
        campaignId: String,
        ctaLabel: String?,
        ctaAction: String,
        ctaValue: String?,
        onInteraction: (type: String, notificationId: String, campaignId: String, ctaLabel: String?) -> Unit
    ) {
        val cornerRadiusPx = dpToPx(activity, 16).toFloat()
        var resolved = false

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
        val cardParams = FrameLayout.LayoutParams(cardWidth, cardHeight).apply {
            gravity = Gravity.CENTER
        }

        fun resolveClick() {
            if (resolved) return
            resolved = true
            Logger.log("InAppPopupOverlay: clicked $notificationId")
            onInteraction("clicked", notificationId, campaignId, ctaLabel)
            if (!ctaValue.isNullOrEmpty()) {
                try {
                    activity.startActivity(Intent(activity, InAppWebViewActivity::class.java).apply {
                        putExtra(InAppWebViewActivity.EXTRA_URL, ctaValue)
                    })
                } catch (e: Exception) {
                    Logger.error("InAppPopupOverlay: failed to open CTA url", e)
                }
            }
            dismiss()
        }

        fun resolveDismiss() {
            if (resolved) return
            resolved = true
            Logger.log("InAppPopupOverlay: dismissed $notificationId")
            onInteraction("dismissed", notificationId, campaignId, null)
            dismiss()
        }

        val imageView = ImageView(activity).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.FIT_CENTER
            adjustViewBounds = true
            setOnClickListener { resolveClick() }
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

        // Close button is a sibling of `card` inside `root` (not a child of card) — positioned
        // via absolute margins computed from card's known on-screen frame above.
        val closeSize = dpToPx(activity, 32)
        val closeButton = FrameLayout(activity).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            elevation = dpToPx(activity, 14).toFloat()
            scaleX = 0.92f
            scaleY = 0.92f
            alpha = 0f
            setOnClickListener { resolveDismiss() }
        }
        val barLength = dpToPx(activity, 12)
        val barThickness = dpToPx(activity, 2)
        val barColor = Color.parseColor("#4A4A4A")
        closeButton.addView(
            View(activity).apply { setBackgroundColor(barColor); rotation = 45f },
            FrameLayout.LayoutParams(barLength, barThickness).apply { gravity = Gravity.CENTER },
        )
        closeButton.addView(
            View(activity).apply { setBackgroundColor(barColor); rotation = -45f },
            FrameLayout.LayoutParams(barLength, barThickness).apply { gravity = Gravity.CENTER },
        )
        val closeParams = FrameLayout.LayoutParams(closeSize, closeSize).apply {
            gravity = Gravity.TOP or Gravity.START
            leftMargin = cardLeft + cardWidth - closeSize / 2
            topMargin = cardTop - closeSize / 2
        }

        root.addView(card, cardParams)
        root.addView(closeButton, closeParams)

        val contentRoot = activity.findViewById<ViewGroup>(android.R.id.content)
        contentRoot.addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        currentRoot = root

        // Host apps aren't guaranteed to use ComponentActivity, unlike RN's own generated
        // activities — if not, the popup is only dismissible via the close button/CTA.
        (activity as? ComponentActivity)?.let { componentActivity ->
            val callback = object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    resolveDismiss()
                }
            }
            componentActivity.onBackPressedDispatcher.addCallback(callback)
            backPressedCallback = callback
        }

        root.animate().alpha(1f).setDuration(180).start()
        card.animate()
            .alpha(1f).scaleX(1f).scaleY(1f)
            .setDuration(220)
            .setInterpolator(DecelerateInterpolator())
            .start()
        closeButton.animate()
            .alpha(1f).scaleX(1f).scaleY(1f)
            .setDuration(220)
            .setInterpolator(DecelerateInterpolator())
            .start()

        Logger.log("InAppPopupOverlay: shown $notificationId")
        onInteraction("shown", notificationId, campaignId, null)
    }

    private fun dismiss() {
        popupShowing = false
        backPressedCallback?.remove()
        backPressedCallback = null
        currentRoot?.let { (it.parent as? ViewGroup)?.removeView(it) }
        currentRoot = null
    }
}
