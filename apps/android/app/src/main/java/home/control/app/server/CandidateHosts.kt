package home.control.app.server

private val IPV4 = Regex("""^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$""")

/** True for a dotted-quad IPv4 literal such as `192.168.0.100`. */
fun isIpv4Literal(value: String): Boolean {
    val match = IPV4.matchEntire(value) ?: return false
    return match.groupValues.drop(1).all { it.toInt() <= 255 }
}

/**
 * The hosts to try for a resolved service: the server's TXT `addr` first when it is a valid IPv4 literal,
 * then every resolved IPv4 address, without repeats.
 */
fun candidateHosts(txtAddr: String?, resolved: List<String>): List<String> {
    val preferred = txtAddr?.trim()?.takeIf(::isIpv4Literal)
    return (listOfNotNull(preferred) + resolved).distinct()
}
