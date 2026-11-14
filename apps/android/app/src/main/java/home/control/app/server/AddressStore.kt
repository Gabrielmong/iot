package home.control.app.server

import android.content.Context

/** Persists the chosen server address. It is never cleared automatically. */
class AddressStore(context: Context) {
    private val prefs = context.getSharedPreferences("server", Context.MODE_PRIVATE)

    fun load(): ServerAddress? = prefs.getString("origin", null)?.let(::ServerAddress)

    fun save(address: ServerAddress) {
        prefs.edit().putString("origin", address.origin).apply()
    }
}
