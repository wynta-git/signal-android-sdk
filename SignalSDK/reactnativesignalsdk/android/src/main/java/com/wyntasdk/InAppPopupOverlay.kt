package com.wyntasdk

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
import java.net.HttpURLConnection
import java.net.URL

/**
 * Renders a single in-app notification (image + tappable CTA baked into the image, plus a
 * close button) as a view attached directly to the host Activity's own content view — never
 * as a separate Activity. Keeping it in-process means the host Activity never pauses while
 * this is shown, so React Native's AppState never reports a false 'background' transition
 * (which previously caused app_foreground → checkInbox to re-fire and cascade into showing
 * additional on_session_start notifications back-to-back).
 */
object InAppPopupOverlay {

    private var currentRoot: View? = null
    private var backPressedCallback: OnBackPressedCallback? = null

    fun show(
        activity: Activity,
        notificationId: String,
        campaignId: String,
        imageUrl: String,
        ctaLabel: String?,
        ctaAction: String,
        ctaValue: String?,
    ) {
        if (imageUrl.isEmpty()) {
            WyntaSDKModule.notifyInAppInteraction("dismissed", notificationId, campaignId, null)
            return
        }

        downloadImage(imageUrl) { bitmap ->
            if (activity.isFinishing || activity.isDestroyed) return@downloadImage
            if (bitmap != null) {
                showPopup(activity, bitmap, notificationId, campaignId, ctaLabel, ctaAction, ctaValue)
            } else {
                WyntaSDKModule.notifyInAppInteraction("dismissed", notificationId, campaignId, null)
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
    ) {
        val cornerRadiusPx = dpToPx(activity, 16).toFloat()
        var resolved = false

        // No separate window behind this overlay to apply a backdrop blur to (that API is
        // window-level), so we keep the flat scrim that previously covered pre-API-31 devices.
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
            WyntaSDKModule.notifyInAppInteraction("clicked", notificationId, campaignId, ctaLabel)
            if (!ctaValue.isNullOrEmpty()) {
                try {
                    activity.startActivity(Intent(activity, InAppWebViewActivity::class.java).apply {
                        putExtra(InAppWebViewActivity.EXTRA_URL, ctaValue)
                    })
                } catch (e: Exception) {
                    // Nothing extra for this version
                }
            }
            dismiss()
        }

        fun resolveDismiss() {
            if (resolved) return
            resolved = true
            WyntaSDKModule.notifyInAppInteraction("dismissed", notificationId, campaignId, null)
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
        // via absolute margins computed from card's known on-screen frame above. This avoids
        // relying on any parent's clipChildren/clipToOutline behavior entirely, since `root`
        // is full-screen and won't clip anything near the popup's corner.
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

        WyntaSDKModule.notifyInAppInteraction("shown", notificationId, campaignId, null)
    }

    private fun dismiss() {
        backPressedCallback?.remove()
        backPressedCallback = null
        currentRoot?.let { (it.parent as? ViewGroup)?.removeView(it) }
        currentRoot = null
    }
}
