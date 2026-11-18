package home.control.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.lifecycle.lifecycleScope
import home.control.app.launch.LaunchResult
import home.control.app.launch.launchFlow
import home.control.app.server.AddressStore
import home.control.app.server.Identity
import home.control.app.server.ServerAddress
import home.control.app.ui.UnreachableActivity
import home.control.app.ui.enableNightEdgeToEdge
import home.control.app.ui.showChooseServerDialog
import home.control.app.update.ApkInstaller
import home.control.app.update.UpdateBar
import home.control.app.update.updateAvailable
import home.control.app.web.HomeChromeClient
import home.control.app.web.HomeWebViewClient
import home.control.app.web.RdpBridge
import home.control.app.web.configureWebView
import kotlinx.coroutines.launch

/** Finds the server, then shows the website full screen; goes to [UnreachableActivity] when it can't. */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var loading: ProgressBar
    private lateinit var updateBar: UpdateBar
    private lateinit var installer: ApkInstaller
    private var serverOrigin = ""
    private var updateUrl = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        enableNightEdgeToEdge()
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply { visibility = View.INVISIBLE }
        loading = ProgressBar(this)
        val page = FrameLayout(this).apply {
            addView(webView)
            addView(loading, FrameLayout.LayoutParams(WRAP, WRAP, android.view.Gravity.CENTER))
        }
        installer = ApkInstaller(this)
        updateBar = UpdateBar(this) { installer.downloadAndInstall(updateUrl) }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(updateBar, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(page, LinearLayout.LayoutParams(MATCH, 0, 1f))
            padForSystemBars()
        }
        setContentView(root)

        configureWebView(webView, BuildConfig.VERSION_NAME)
        webView.webViewClient = HomeWebViewClient({ serverOrigin }, ::showUnreachable)
        webView.webChromeClient = HomeChromeClient(this)
        webView.addJavascriptInterface(RdpBridge(this), RdpBridge.NAME)

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }

        val restored = savedInstanceState?.getString(KEY_ORIGIN)
        if (restored != null && webView.restoreState(savedInstanceState) != null) {
            serverOrigin = restored
            showWebsite()
        } else {
            findServer()
        }
    }

    private fun findServer() {
        lifecycleScope.launch {
            when (val result = launchFlow(this@MainActivity).run()) {
                is LaunchResult.Load -> {
                    load(result.address)
                    offerUpdate(result.address, result.identity)
                }
                is LaunchResult.Choose -> showChooseServerDialog(
                    this@MainActivity,
                    result.servers,
                    onPick = { picked ->
                        AddressStore(this@MainActivity).save(picked.address)
                        load(picked.address)
                    },
                    onCancel = ::showUnreachable,
                )
                LaunchResult.Unreachable -> showUnreachable()
            }
        }
    }

    private fun load(address: ServerAddress) {
        serverOrigin = address.origin
        webView.loadUrl(serverOrigin)
        showWebsite()
    }

    private fun offerUpdate(address: ServerAddress, identity: Identity) {
        if (!updateAvailable(BuildConfig.VERSION_CODE, identity.apkVersionCode)) return
        updateUrl = address.url("/app/home.apk")
        updateBar.show()
    }

    private fun showWebsite() {
        loading.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (serverOrigin.isNotEmpty()) {
            outState.putString(KEY_ORIGIN, serverOrigin)
            webView.saveState(outState)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        installer.resumePendingInstall()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        installer.close()
        webView.destroy()
        super.onDestroy()
    }

    private fun showUnreachable() {
        startActivity(Intent(this, UnreachableActivity::class.java))
        finish()
    }

    private companion object {
        const val KEY_ORIGIN = "serverOrigin"
        const val WRAP = FrameLayout.LayoutParams.WRAP_CONTENT
        const val MATCH = FrameLayout.LayoutParams.MATCH_PARENT
    }
}
