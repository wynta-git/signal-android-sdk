package com.wyntasdk

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
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
import java.net.HttpURLConnection
import java.net.URL

/**
 * Transparent, no-animation overlay Activity that renders a single in-app notification
 * (image + tappable CTA baked into the image, plus a close button) on top of whatever
 * screen the host app currently has open. Launched only from WyntaSDKModule — never
 * declared or referenced by the host app.
 */
class InAppPopupActivity : Activity() {

    companion object {
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_CAMPAIGN_ID     = "campaign_id"
        const val EXTRA_IMAGE_URL       = "image_url"
        const val EXTRA_CTA_LABEL       = "cta_label"
        const val EXTRA_CTA_ACTION      = "cta_action"
        const val EXTRA_CTA_VALUE       = "cta_value"
    }

    private var notificationId: String? = null
    private var campaignId: String? = null
    private var ctaLabel: String? = null
    private var ctaAction: String? = null
    private var ctaValue: String? = null
    private var resolved = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        overridePendingTransition(0, 0)

        notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID)
        campaignId     = intent.getStringExtra(EXTRA_CAMPAIGN_ID)
        val imageUrl   = intent.getStringExtra(EXTRA_IMAGE_URL)
        ctaLabel       = intent.getStringExtra(EXTRA_CTA_LABEL)
        ctaAction      = intent.getStringExtra(EXTRA_CTA_ACTION)
        ctaValue       = intent.getStringExtra(EXTRA_CTA_VALUE)

        if (notificationId == null || campaignId == null || imageUrl.isNullOrEmpty()) {
            finish()
            return
        }

        downloadImage(imageUrl)
    }

    private fun downloadImage(imageUrl: String) {
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

            Handler(Looper.getMainLooper()).post {
                if (isFinishing) return@post
                if (bitmap != null) showPopup(bitmap) else finish()
            }
        }.start()
    }

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics).toInt()

    private fun showPopup(bitmap: Bitmap) {
        val cornerRadiusPx = dpToPx(16).toFloat()
        val canBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

        val root = FrameLayout(this).apply {
            // Blur-behind (API 31+) needs a lighter scrim — the blur itself does most of the
            // work of separating the popup from the app underneath. Older versions fall back
            // to a darker flat scrim since there's no blur to help with that separation.
            setBackgroundColor(if (canBlur) Color.parseColor("#59000000") else Color.parseColor("#A6000000"))
            alpha = 0f
        }

        if (canBlur) {
            window.setBackgroundBlurRadius(dpToPx(24))
        }

        val screenWidth = resources.displayMetrics.widthPixels
        val screenHeight = resources.displayMetrics.heightPixels
        val cardWidth = (screenWidth * 0.85).toInt()
        val cardHeight = (cardWidth.toFloat() * bitmap.height / bitmap.width).toInt()
        val cardLeft = (screenWidth - cardWidth) / 2
        val cardTop = (screenHeight - cardHeight) / 2

        // Fixed width/height (not WRAP_CONTENT) so cardLeft/cardTop above are exactly where
        // Gravity.CENTER will actually place it — needed to position the close button below.
        val card = FrameLayout(this).apply {
            elevation = dpToPx(12).toFloat()
            scaleX = 0.92f
            scaleY = 0.92f
            alpha = 0f
        }
        val cardParams = FrameLayout.LayoutParams(cardWidth, cardHeight).apply {
            gravity = Gravity.CENTER
        }

        val imageView = ImageView(this).apply {
            setImageBitmap(bitmap)
            scaleType = ImageView.ScaleType.FIT_CENTER
            adjustViewBounds = true
            setOnClickListener { handleClick() }
        }

        val clipContainer = FrameLayout(this).apply {
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
        val closeSize = dpToPx(32)
        val closeButton = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            elevation = dpToPx(14).toFloat()
            scaleX = 0.92f
            scaleY = 0.92f
            alpha = 0f
            setOnClickListener { handleDismiss() }
        }
        val barLength = dpToPx(12)
        val barThickness = dpToPx(2)
        val barColor = Color.parseColor("#4A4A4A")
        closeButton.addView(
            View(this).apply { setBackgroundColor(barColor); rotation = 45f },
            FrameLayout.LayoutParams(barLength, barThickness).apply { gravity = Gravity.CENTER },
        )
        closeButton.addView(
            View(this).apply { setBackgroundColor(barColor); rotation = -45f },
            FrameLayout.LayoutParams(barLength, barThickness).apply { gravity = Gravity.CENTER },
        )
        val closeParams = FrameLayout.LayoutParams(closeSize, closeSize).apply {
            gravity = Gravity.TOP or Gravity.START
            leftMargin = cardLeft + cardWidth - closeSize / 2
            topMargin = cardTop - closeSize / 2
        }

        root.addView(card, cardParams)
        root.addView(closeButton, closeParams)
        setContentView(root)

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

        WyntaSDKModule.notifyInAppInteraction("shown", notificationId!!, campaignId!!, null)
    }

    private fun handleClick() {
        if (resolved) return
        resolved = true
        WyntaSDKModule.notifyInAppInteraction("clicked", notificationId!!, campaignId!!, ctaLabel)

        // Opens in-app regardless of `ctaAction` — campaigns have been seen with a real
        // `value` even when `ctaAction` is "dismiss", so `value` alone decides whether to open.
        if (!ctaValue.isNullOrEmpty()) {
            try {
                startActivity(Intent(this, InAppWebViewActivity::class.java).apply {
                    putExtra(InAppWebViewActivity.EXTRA_URL, ctaValue)
                })
            } catch (e: Exception) {
                // Nothing extra for this version
            }
        }
        finish()
        overridePendingTransition(0, 0)
    }

    private fun handleDismiss() {
        if (resolved) return
        resolved = true
        WyntaSDKModule.notifyInAppInteraction("dismissed", notificationId!!, campaignId!!, null)
        finish()
        overridePendingTransition(0, 0)
    }

    override fun onBackPressed() {
        handleDismiss()
    }
}
