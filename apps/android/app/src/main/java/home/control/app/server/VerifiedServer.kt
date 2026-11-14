package home.control.app.server

/** A discovered server with the first of its addresses that passed the identity check. */
data class VerifiedServer(val name: String, val address: ServerAddress, val identity: Identity)

/** Checks [found]'s candidates in order; the first that answers wins. Null when none does. */
suspend fun verify(found: FoundServer, check: suspend (ServerAddress) -> Identity?): VerifiedServer? {
    for (candidate in found.candidates) {
        val identity = check(candidate) ?: continue
        return VerifiedServer(found.name, candidate, identity)
    }
    return null
}

/** Verifies every server in [found], dropping those that don't answer and duplicates of the same address. */
suspend fun verifyAll(found: List<FoundServer>, check: suspend (ServerAddress) -> Identity?): List<VerifiedServer> =
    found.mapNotNull { verify(it, check) }.distinctBy { it.address.origin }
