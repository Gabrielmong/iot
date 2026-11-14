package home.control.app.update

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import home.control.app.R

private const val ACCENT = "#1d4ed8"

/** A slim "Update available" strip: tap the text to install, tap the cross to hide it until the next launch. */
class UpdateBar(context: Context, onInstall: () -> Unit) : LinearLayout(context) {

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(Color.parseColor(ACCENT))
        visibility = GONE

        val pad = (12 * resources.displayMetrics.density).toInt()
        addView(
            TextView(context).apply {
                setText(R.string.update_available)
                setTextColor(Color.WHITE)
                setPadding(pad, pad, pad, pad)
                setOnClickListener { onInstall() }
            },
            LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f),
        )
        addView(
            TextView(context).apply {
                text = "×"
                textSize = 20f
                setTextColor(Color.WHITE)
                setPadding(pad, 0, pad, 0)
                contentDescription = context.getString(R.string.update_dismiss)
                setOnClickListener { visibility = GONE }
            },
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT),
        )
    }

    fun show() {
        visibility = VISIBLE
    }
}
