package home.control.app.server

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CandidateHostsTest {

    @Test
    fun `a valid TXT addr comes first`() {
        assertEquals(
            listOf("192.168.0.100", "172.17.0.1"),
            candidateHosts("192.168.0.100", listOf("172.17.0.1", "192.168.0.100")),
        )
    }

    @Test
    fun `every resolved address is kept in order without a TXT addr`() {
        assertEquals(listOf("172.17.0.1", "192.168.0.100"), candidateHosts(null, listOf("172.17.0.1", "192.168.0.100")))
    }

    @Test
    fun `an invalid TXT addr is ignored`() {
        listOf("", "home.local", "300.1.1.1", "1.2.3", "fe80::1", "1.2.3.4.5").forEach {
            assertEquals(it, listOf("10.0.0.2"), candidateHosts(it, listOf("10.0.0.2")))
        }
    }

    @Test
    fun `ipv4 literals are recognised`() {
        assertTrue(isIpv4Literal("0.0.0.0"))
        assertTrue(isIpv4Literal("255.255.255.255"))
        assertFalse(isIpv4Literal("256.0.0.1"))
        assertFalse(isIpv4Literal(" 1.2.3.4"))
        assertFalse(isIpv4Literal("1.2.3.4x"))
    }
}
