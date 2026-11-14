package home.control.app.server

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** Asks a server who it is via `GET /api/identity`. */
class IdentityClient {

    /** The server's [Identity], or null if it is unreachable, slow (over [timeoutMs] in total), or not a home-control server. */
    suspend fun check(address: ServerAddress, timeoutMs: Int = 2000): Identity? =
        withTimeoutOrNull(timeoutMs.toLong()) {
            withContext(Dispatchers.IO) { fetch(address, timeoutMs / 2) }
        }

    /** Connect and read each get half the budget; the surrounding timeout bounds the total. */
    private fun fetch(address: ServerAddress, socketTimeoutMs: Int): Identity? {
        return try {
            val connection = URL(address.url("api/identity")).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = socketTimeoutMs
                connection.readTimeout = socketTimeoutMs
                if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                    null
                } else {
                    Identity.parse(connection.inputStream.bufferedReader().use { it.readText() })
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }
}
