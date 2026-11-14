package home.control.app.launch

import home.control.app.server.FoundServer
import home.control.app.server.Identity
import home.control.app.server.ServerAddress
import home.control.app.server.verifyAll

/** Finds the server on launch: saved address, then identity check, then a network search. */
class LaunchFlow(
    private val load: () -> ServerAddress?,
    private val save: (ServerAddress) -> Unit,
    private val check: suspend (ServerAddress) -> Identity?,
    private val search: suspend () -> List<FoundServer>,
) {

    suspend fun run(): LaunchResult {
        val saved = load()
        if (saved != null) {
            val identity = check(saved)
            if (identity != null) return LaunchResult.Load(saved, identity)
        }
        return fromSearch()
    }

    /**
     * Each found server is tried at its candidate addresses in order. A single answering server is saved and loaded;
     * several are left for the user to choose. The saved address is never erased.
     */
    private suspend fun fromSearch(): LaunchResult {
        val answering = verifyAll(search(), check)
        return when (answering.size) {
            0 -> LaunchResult.Unreachable
            1 -> {
                val server = answering.single()
                save(server.address)
                LaunchResult.Load(server.address, server.identity)
            }
            else -> LaunchResult.Choose(answering)
        }
    }
}
