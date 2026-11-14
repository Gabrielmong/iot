package home.control.app.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import androidx.activity.ComponentActivity
import home.control.app.R
import home.control.app.padForSystemBars

/** "Can't reach Home": Retry re-runs the launch flow, Settings opens the server settings. */
class UnreachableActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableNightEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_unreachable)
        findViewById<View>(R.id.unreachable_root).padForSystemBars()
        findViewById<Button>(R.id.retry).setOnClickListener { restartMain() }
        findViewById<Button>(R.id.settings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }
}
