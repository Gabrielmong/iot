package home.control.app.ui

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import home.control.app.BuildConfig
import home.control.app.R
import home.control.app.padForSystemBars
import home.control.app.server.AddressStore
import home.control.app.server.IdentityClient
import home.control.app.server.NsdDiscovery
import home.control.app.server.ServerAddress
import home.control.app.server.VerifiedServer
import home.control.app.server.verifyAll
import kotlinx.coroutines.launch

/** Edit, test, search for and save the server address. Saving returns to [home.control.app.MainActivity]. */
class SettingsActivity : ComponentActivity() {

    private val store by lazy { AddressStore(this) }
    private lateinit var address: EditText
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        enableNightEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        findViewById<View>(R.id.settings_root).padForSystemBars()

        address = findViewById(R.id.address)
        status = findViewById(R.id.status)
        findViewById<TextView>(R.id.version).text = getString(R.string.settings_version, BuildConfig.VERSION_NAME)
        if (savedInstanceState == null) address.setText(store.load()?.origin.orEmpty())

        findViewById<Button>(R.id.test).setOnClickListener { test() }
        findViewById<Button>(R.id.search).setOnClickListener { search() }
        findViewById<Button>(R.id.save).setOnClickListener { parsed()?.let(::saveAndLeave) }
    }

    /** The field's address, or null after showing the inline error. */
    private fun parsed(): ServerAddress? {
        val parsed = ServerAddress.parse(address.text.toString())
        if (parsed == null) address.error = getString(R.string.settings_invalid_address)
        return parsed
    }

    private fun test() {
        val target = parsed() ?: return
        status.setText(R.string.settings_searching)
        lifecycleScope.launch {
            val identity = IdentityClient().check(target)
            status.text = if (identity != null) {
                getString(R.string.settings_found, identity.name)
            } else {
                getString(R.string.settings_not_found)
            }
        }
    }

    private fun search() {
        status.setText(R.string.settings_searching)
        lifecycleScope.launch {
            val identity = IdentityClient()
            val found = verifyAll(NsdDiscovery(this@SettingsActivity).search()) { identity.check(it) }
            if (found.isEmpty()) {
                status.setText(R.string.settings_search_empty)
            } else {
                status.text = ""
                showChooseServerDialog(this@SettingsActivity, found, onPick = ::pick)
            }
        }
    }

    private fun pick(server: VerifiedServer) = saveAndLeave(server.address)

    private fun saveAndLeave(target: ServerAddress) {
        store.save(target)
        restartMain()
    }
}
