package home.control.app.update

import android.content.Context
import java.io.File

/** Where the verified-and-installed copy lives: app-private, so no other app can swap it. */
fun privateApkFile(context: Context): File = File(context.filesDir, "updates/home.apk")

/** Copies [source] into app-private storage, replacing any previous copy. */
fun copyToPrivate(context: Context, source: File): File {
    val target = privateApkFile(context)
    target.parentFile?.mkdirs()
    target.delete()
    source.inputStream().use { input -> target.outputStream().use { input.copyTo(it) } }
    return target
}
