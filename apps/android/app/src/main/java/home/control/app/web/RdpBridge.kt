package home.control.app.web

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.FileProvider
import home.control.app.R
import java.io.File

/**
 * `window.HomeApp` in the website: opens a Remote Desktop connection file in the phone's Remote Desktop app
 * (a WebView can't download the website's blob files itself). Only the server's pages load in the WebView.
 */
class RdpBridge(private val activity: Activity) {

    @JavascriptInterface
    fun openRdp(contents: String, fileName: String) {
        val dir = File(activity.cacheDir, RDP_DIR).apply { mkdirs() }
        val file = File(dir, File(fileName).name.ifBlank { "Remote Desktop.rdp" })
        file.writeText(contents)
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, RDP_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.runOnUiThread {
            try {
                activity.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(activity, R.string.rdp_no_app, Toast.LENGTH_LONG).show()
            }
        }
    }

    companion object {
        const val NAME = "HomeApp"
        private const val RDP_DIR = "rdp"
        private const val RDP_MIME = "application/x-rdp"
    }
}
