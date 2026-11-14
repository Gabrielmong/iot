package home.control.app.server

/** A home server discovered on the local network; [candidates] are its addresses in the order to try them. */
data class FoundServer(val name: String, val candidates: List<ServerAddress>)
