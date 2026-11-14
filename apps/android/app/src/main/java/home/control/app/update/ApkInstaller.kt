package home.control.app.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import home.control.app.R
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

private const val APK_NAME = "home.apk"
private const val APK_MIME = "application/vnd.android.package-archive"

/**
 * Downloads the server's APK with the system downloader, then hands it to the package installer.
 * Android 10+ blocks starting the installer from the background, so a verified copy waits for [resumePendingInstall].
 */
class ApkInstaller(private val activity: ComponentActivity) {

    private var receiver: BroadcastReceiver? = null

    /** A verified private copy waiting for the activity to be in front. */
    private var pending: File? = null

    private val downloading get() = receiver != null

    fun downloadAndInstall(url: String) {
        if (downloading) return
        if (!activity.packageManager.canRequestPackageInstalls()) {
            askInstallPermission()
            return
        }
        val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
        val file = File(dir, APK_NAME).also { it.delete() }

        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(APK_NAME)
            .setMimeType(APK_MIME)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationUri(Uri.fromFile(file))
        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        listenFor(manager.enqueue(request), file)
    }

    /** Starts an install that was verified while the activity was in the background; call from onResume. */
    fun resumePendingInstall() {
        val file = pending ?: return
        pending = null
        if (file.exists()) install(file)
    }

    /** Stops waiting for a download; call from the activity's onDestroy. */
    fun close() {
        receiver?.let { activity.unregisterReceiver(it) }
        receiver = null
    }

    private fun listenFor(downloadId: Long, file: File) {
        close()
        val completed = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != downloadId) return
                close()
                finish(succeeded(downloadId), file)
            }
        }
        receiver = completed
        ContextCompat.registerReceiver(
            activity,
            completed,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private fun succeeded(downloadId: Long): Boolean {
        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.query(DownloadManager.Query().setFilterById(downloadId))?.use { cursor ->
            if (!cursor.moveToFirst()) return false
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            return status == DownloadManager.STATUS_SUCCESSFUL
        }
        return false
    }

    /** Verifies and installs a private copy, so the file can't change between the check and the install. */
    private fun finish(downloaded: Boolean, file: File) {
        val copy = privateApkFile(activity)
        try {
            if (downloaded) {
                copyToPrivate(activity, file)
                file.delete()
                if (isTrustedApk(activity, copy)) {
                    installWhenResumed(copy)
                    return
                }
            }
        } catch (_: Exception) {
            // fall through to reject
        }
        reject(file, copy)
    }

    private fun reject(vararg files: File) {
        files.forEach { it.delete() }
        Toast.makeText(activity, R.string.update_invalid, Toast.LENGTH_LONG).show()
    }

    private fun installWhenResumed(file: File) {
        if (activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) install(file) else pending = file
    }

    private fun install(file: File) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.startActivity(intent)
    }

    private fun askInstallPermission() {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
            .setData(Uri.parse("package:${activity.packageName}"))
        activity.startActivity(intent)
    }
}
