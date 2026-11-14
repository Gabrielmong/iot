package home.control.app.server

private const val DEFAULT_PORT = 4000
private const val PORT_RANGE_MAX = 65535

/** Letters, digits, dots and dashes, not starting or ending with a dot or dash. */
private val HOST = Regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$")
private val PORT = Regex("^[0-9]{1,5}$")

/** A home server origin, always normalised to `http://<host>:<port>` with a lowercase host. */
@JvmInline
value class ServerAddress(val origin: String) {

    /** Joins [path] onto the origin with exactly one slash. */
    fun url(path: String): String = origin + "/" + path.trimStart('/')

    companion object {
        /** Parses user input such as `192.168.0.100`, `Home.Local:8080` or `http://host:4000/`; null if invalid. */
        fun parse(input: String): ServerAddress? {
            val trimmed = input.trim()
            val afterScheme = stripHttpScheme(trimmed) ?: return null
            val hostAndPort = afterScheme.removeSuffix("/")
            if (hostAndPort.contains('/')) return null

            val host = hostAndPort.substringBefore(':').lowercase()
            if (!HOST.matches(host)) return null

            val port = if (hostAndPort.contains(':')) {
                val digits = hostAndPort.substringAfter(':')
                if (!PORT.matches(digits)) return null
                digits.toInt()
            } else {
                DEFAULT_PORT
            }
            if (port !in 1..PORT_RANGE_MAX) return null

            return ServerAddress("http://$host:$port")
        }

        /** Drops a leading `http://` (any case); null when another scheme is present. */
        private fun stripHttpScheme(value: String): String? {
            if (value.startsWith("http://", ignoreCase = true)) return value.substring("http://".length)
            return if (value.contains("://")) null else value
        }
    }
}
