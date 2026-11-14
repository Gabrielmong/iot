package home.control.app.launch

import android.content.Context
import home.control.app.server.AddressStore
import home.control.app.server.IdentityClient
import home.control.app.server.NsdDiscovery

/** A [LaunchFlow] wired to the phone's saved address, the identity check and the network search. */
fun launchFlow(context: Context): LaunchFlow {
    val store = AddressStore(context)
    val identity = IdentityClient()
    val discovery = NsdDiscovery(context)
    return LaunchFlow(
        load = store::load,
        save = store::save,
        check = { identity.check(it) },
        search = { discovery.search() },
    )
}
