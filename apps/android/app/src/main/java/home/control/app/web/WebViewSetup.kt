package home.control.app.web

import android.annotation.SuppressLint
import android.webkit.WebView

/** Makes the WebView behave like the phone's browser does for the website, and tags it as the app. */
@SuppressLint("SetJavaScriptEnabled") // The website is a JavaScript app served by the user's own server.
fun configureWebView(webView: WebView, versionName: String) {
    webView.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true // The session token lives in localStorage.
        mediaPlaybackRequiresUserGesture = false // Camera streams start without a tap.
        userAgentString = "$userAgentString HomeApp/$versionName"
    }
}
