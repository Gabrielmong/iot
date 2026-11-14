package home.control.app.server

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServerAddressTest {
    private val expected = ServerAddress("http://192.168.0.100:4000")

    @Test
    fun `bare host gets the default port`() {
        assertEquals(ServerAddress("http://192.168.0.100:4000"), ServerAddress.parse("192.168.0.100"))
    }

    @Test
    fun `surrounding whitespace is trimmed`() {
        assertEquals(expected, ServerAddress.parse(" 192.168.0.100:4000 "))
    }

    @Test
    fun `scheme and trailing slash are normalised`() {
        assertEquals(expected, ServerAddress.parse("http://192.168.0.100:4000/"))
        assertEquals(expected, ServerAddress.parse("HTTP://192.168.0.100:4000"))
    }

    @Test
    fun `host is lowercased`() {
        assertEquals(ServerAddress("http://home.local:8080"), ServerAddress.parse("Home.Local:8080"))
    }

    @Test
    fun `invalid input is rejected`() {
        listOf("", "https://x", "a b", "host:0", "host:70000", "http://host/path", "host:", "http://", ":4000")
            .forEach { assertNull(it, ServerAddress.parse(it)) }
    }

    @Test
    fun `hosts outside letters, digits, dots and dashes are rejected`() {
        listOf("user@host", "host?x", "ho\$t", "[::1]", "[::1]:4000", "http://[fe80::1]:4000", "ho_st", "host#x")
            .forEach { assertNull(it, ServerAddress.parse(it)) }
    }

    @Test
    fun `hosts starting or ending with a dot or dash are rejected`() {
        listOf(".host", "host.", "-host", "host-", ".", "-", "host.:4000")
            .forEach { assertNull(it, ServerAddress.parse(it)) }
    }

    @Test
    fun `ports must be plain digits`() {
        listOf("host:+80", "host:-80", "host: 80", "host:80a", "host:0x50", "host:80:90", "host:123456")
            .forEach { assertNull(it, ServerAddress.parse(it)) }
    }

    @Test
    fun `dashes and dots inside the host are kept`() {
        assertEquals(ServerAddress("http://my-home.lan:65535"), ServerAddress.parse("My-Home.LAN:65535"))
        assertEquals(ServerAddress("http://host:1"), ServerAddress.parse("host:1"))
    }

    @Test
    fun `url joins with exactly one slash`() {
        assertEquals("http://192.168.0.100:4000/api/identity", expected.url("/api/identity"))
        assertEquals("http://192.168.0.100:4000/api/identity", expected.url("api/identity"))
    }
}
