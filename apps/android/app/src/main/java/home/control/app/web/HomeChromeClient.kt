package home.control.app.web

import android.content.ActivityNotFoundException
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.graphics.createBitmap

/** Answers the website's `<input type="file">` (avatar upload) with Android's file picker. Create it in `onCreate`. */
class HomeChromeClient(activity: ComponentActivity) : WebChromeClient() {

    private var pending: ValueCallback<Array<Uri>>? = null

    private val picker = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        pending?.onReceiveValue(FileChooserParams.parseResult(result.resultCode, result.data))
        pending = null
    }

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean {
        pending?.onReceiveValue(null)
        pending = filePathCallback
        try {
            picker.launch(fileChooserParams.createIntent())
        } catch (_: ActivityNotFoundException) {
            pending?.onReceiveValue(null)
            pending = null
        }
        return true
    }

    /** No grey play-button poster while a camera stream is starting. */
    override fun getDefaultVideoPoster(): Bitmap = createBitmap(1, 1)
}
