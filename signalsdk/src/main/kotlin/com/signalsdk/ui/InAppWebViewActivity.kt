package com.signalsdk.ui

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout

/**
 * Full-screen in-app browser for a notification CTA's `value` URL. Launched only from
 * InAppPopupOverlay when a tapped CTA has a non-empty value — never declared or
 * referenced by the host app. Ported from the React Native SDK's android/InAppWebViewActivity.kt.
 */
internal class InAppWebViewActivity : Activity() {

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
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    handleNavigation(request.url)

                @Deprecated("Pre-API 24 callback; same handling")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                    handleNavigation(Uri.parse(url))
            }
            loadUrl(url)
        }
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        setContentView(root)
    }

    // http/https keep loading in the WebView. Anything else — intent:// (e.g. the Play Store web
    // page's "open in app" hand-off), market://, tel:, mailto:, upi:, whatsapp: — can't be shown by
    // a WebView (it would display ERR_UNKNOWN_URL_SCHEME with that address), so it's handed to
    // Android to open in the right app; the WebView stays as it is. Returns true when the WebView should not load the URL.
    private fun handleNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        if (scheme == "http" || scheme == "https") return false
        if (scheme == "intent") {
            val intent = try {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
            } catch (e: Exception) {
                return true
            }
            // A web page must not be able to target a specific (possibly non-exported) component
            // through an intent:// link — only let it pick an app that accepts BROWSABLE links.
            intent.addCategory(Intent.CATEGORY_BROWSABLE)
            intent.component = null
            intent.selector = null
            if (!startExternal(intent)) {
                // No app for it: use the link's own web fallback, if it provides one.
                intent.getStringExtra("browser_fallback_url")?.let { webView.loadUrl(it) }
            }
            return true
        }
        startExternal(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        return true
    }

    private fun startExternal(intent: Intent): Boolean = try {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    } catch (e: SecurityException) {
        false
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
