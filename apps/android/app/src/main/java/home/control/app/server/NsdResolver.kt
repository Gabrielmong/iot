package home.control.app.server

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import java.net.Inet4Address
import java.net.InetAddress
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Resolves a discovered NSD service to a [FoundServer]; IPv4 only (the address form cannot carry IPv6). */
class NsdResolver(private val nsdManager: NsdManager, private val executor: java.util.concurrent.Executor) {

    /** Older APIs allow only one resolve at a time. */
    private val legacyLock = Mutex()

    suspend fun resolve(info: NsdServiceInfo): FoundServer? {
        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            resolveModern(info)
        } else {
            legacyLock.withLock { resolveLegacy(info) }
        } ?: return null
        val candidates = candidateHosts(txtAddr(resolved), ipv4Hosts(resolved))
            .mapNotNull { ServerAddress.parse("$it:${resolved.port}") }
        if (candidates.isEmpty()) return null
        return FoundServer(resolved.serviceName, candidates)
    }

    /** The server's preferred LAN address, published as TXT `addr`. */
    private fun txtAddr(info: NsdServiceInfo): String? =
        info.attributes["addr"]?.toString(Charsets.UTF_8)

    private fun ipv4Hosts(info: NsdServiceInfo): List<String> {
        val addresses: List<InetAddress> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            info.hostAddresses
        } else {
            @Suppress("DEPRECATION")
            listOfNotNull(info.host)
        }
        return addresses.filterIsInstance<Inet4Address>().mapNotNull { it.hostAddress }
    }

    @android.annotation.SuppressLint("NewApi")
    private suspend fun resolveModern(info: NsdServiceInfo): NsdServiceInfo? {
        var registered: NsdManager.ServiceInfoCallback? = null
        try {
            return suspendCancellableCoroutine { continuation ->
                val callback = object : NsdManager.ServiceInfoCallback {
                    override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
                        if (continuation.isActive) continuation.resume(null)
                    }

                    override fun onServiceUpdated(serviceInfo: NsdServiceInfo) {
                        // Wait for an update that carries an IPv4 address; the search timeout covers the rest.
                        val hasIpv4 = serviceInfo.hostAddresses.any { it is Inet4Address }
                        if (hasIpv4 && continuation.isActive) continuation.resume(serviceInfo)
                    }

                    override fun onServiceLost() = Unit

                    override fun onServiceInfoCallbackUnregistered() = Unit
                }
                registered = callback
                nsdManager.registerServiceInfoCallback(info, executor, callback)
            }
        } finally {
            registered?.let(::unregister)
        }
    }

    @android.annotation.SuppressLint("NewApi")
    private fun unregister(callback: NsdManager.ServiceInfoCallback) {
        try {
            nsdManager.unregisterServiceInfoCallback(callback)
        } catch (_: IllegalArgumentException) {
            // Registration failed or was already removed.
        }
    }

    @Suppress("DEPRECATION")
    private suspend fun resolveLegacy(info: NsdServiceInfo): NsdServiceInfo? =
        suspendCancellableCoroutine { continuation ->
            nsdManager.resolveService(info, object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    if (continuation.isActive) continuation.resume(null)
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    if (continuation.isActive) continuation.resume(serviceInfo)
                }
            })
        }
}
