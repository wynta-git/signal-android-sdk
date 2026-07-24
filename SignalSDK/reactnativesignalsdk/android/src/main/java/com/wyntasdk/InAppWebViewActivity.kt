package com.wyntasdk

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout

/**
 * Full-screen in-app browser for a notification CTA's `value` URL. Launched only from
 * InAppPopupOverlay when a tapped CTA has a non-empty value — never declared or
 * referenced by the host app.
 */
class InAppWebViewActivity : Activity() {

    companion object {
        const val EXTRA_URL = "url"
    }

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrEmpty()) {
            finish()
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
        }

        val closeSize = dpToPx(32)
        val closeButton = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#EEEEEE"))
            }
            setOnClickListener { finish() }
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

        val topBar = FrameLayout(this).apply {
            setPadding(dpToPx(12), dpToPx(12), dpToPx(12), dpToPx(12))
            addView(closeButton, FrameLayout.LayoutParams(closeSize, closeSize).apply {
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
            })
        }
        root.addView(topBar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            webViewClient = WebViewClient()
            loadUrl(url)
        }
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        setContentView(root)
    }

    private fun dpToPx(dp: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp.toFloat(), resources.displayMetrics).toInt()

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            finish()
        }
    }
}
