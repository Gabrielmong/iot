package home.control.app.web

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri

/**
 * Keeps navigation to the server inside the app and sends every other link to the phone's browser.
 * A failed main-frame load (server gone) or a dead renderer is reported once; failures of single requests are the website's business.
 */
class HomeWebViewClient(
    private val serverOrigin: () -> String,
    private val onMainFrameError: () -> Unit,
) : WebViewClient() {

    private var reported = false

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (!request.isForMainFrame || isServer(request.url)) return false
        openOutside(view, request.url)
        return true
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) report()
    }

    /** The renderer died; the WebView is unusable, so tell the owner instead of letting the app crash. */
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        report()
        return true
    }

    private fun report() {
        if (reported) return
        reported = true
        onMainFrameError()
    }

    private fun openOutside(view: WebView, url: Uri) {
        try {
            view.context.startActivity(Intent(Intent.ACTION_VIEW, url))
        } catch (_: ActivityNotFoundException) {
            // Nothing on the phone handles this link; stay on the page.
        }
    }

    private fun isServer(url: Uri): Boolean = originOf(url) == originOf(serverOrigin().toUri())

    /** `scheme://host:port`, lowercase, port spelled out when the URL leaves it implicit. */
    private fun originOf(url: Uri): String {
        val scheme = url.scheme?.lowercase() ?: return ""
        val host = url.host?.lowercase() ?: return ""
        val port = if (url.port != -1) url.port else defaultPort(scheme)
        return "$scheme://$host:$port"
    }

    private fun defaultPort(scheme: String): Int = if (scheme == "https") 443 else 80
}
