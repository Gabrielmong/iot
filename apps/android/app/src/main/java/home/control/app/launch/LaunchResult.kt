package home.control.app.launch

import home.control.app.server.Identity
import home.control.app.server.ServerAddress
import home.control.app.server.VerifiedServer

/** Where the launch flow ended up. */
sealed interface LaunchResult {
    /** A server answered at [address]; [identity] is what it said about itself. */
    data class Load(val address: ServerAddress, val identity: Identity) : LaunchResult

    /** Several servers answered the search; the user picks one. */
    data class Choose(val servers: List<VerifiedServer>) : LaunchResult

    /** Nothing answered. */
    data object Unreachable : LaunchResult
}
