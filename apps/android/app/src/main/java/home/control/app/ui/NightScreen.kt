package home.control.app.ui

import android.content.Context
import android.content.Intent
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import home.control.app.MainActivity

/** Edge to edge with light-on-dark system bars; call before `super.onCreate`. */
fun ComponentActivity.enableNightEdgeToEdge() {
    enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
}

/** Starts [MainActivity] fresh (it re-runs the launch flow), dropping every other screen. */
fun Context.restartMain() {
    startActivity(
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
    )
}
