package home.control.app.server

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import androidx.core.content.ContextCompat
import java.util.Collections
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

private const val SERVICE_TYPE = "_home-control._tcp"
private const val LOCK_TAG = "home-discovery"

/** Finds home servers on the local network through mDNS / DNS-SD. */
class NsdDiscovery(context: Context) {

    private val appContext = context.applicationContext
    private val nsdManager = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val resolver = NsdResolver(nsdManager, ContextCompat.getMainExecutor(appContext))

    /** Searches for [timeoutMs] and returns every server resolved by then, de-duplicated by its addresses. */
    suspend fun search(timeoutMs: Long = 5000): List<FoundServer> {
        val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val lock = wifi.createMulticastLock(LOCK_TAG).apply { setReferenceCounted(false) }
        val found = Collections.synchronizedMap(LinkedHashMap<String, FoundServer>())
        lock.acquire()
        try {
            withTimeoutOrNull(timeoutMs) {
                coroutineScope {
                    discover().collect { info ->
                        launch { resolver.resolve(info)?.let { found.putIfAbsent(it.candidates.joinToString { c -> c.origin }, it) } }
                    }
                }
            }
        } finally {
            lock.release()
        }
        return synchronized(found) { found.values.toList() }
    }

    /** Emits services as they appear; stops discovery when the collector is cancelled. */
    private fun discover(): Flow<NsdServiceInfo> = callbackFlow {
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                trySend(serviceInfo)
            }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                close()
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
        }
        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        awaitClose {
            try {
                nsdManager.stopServiceDiscovery(listener)
            } catch (_: IllegalArgumentException) {
                // Discovery never started.
            }
        }
    }
}
