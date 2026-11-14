package home.control.app.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkVerifierTest {

    private fun trusted(
        pkg: String? = "home.control.app",
        certs: Set<String> = setOf("aa"),
        own: Set<String> = setOf("aa"),
        candidateVersion: Long = 6,
    ) = isTrustedUpdate("home.control.app", own, 5, pkg, certs, candidateVersion)

    @Test
    fun matchingNewerBuildIsTrusted() = assertTrue(trusted())

    @Test
    fun differentPackageIsRejected() = assertFalse(trusted(pkg = "evil.app"))

    @Test
    fun missingPackageIsRejected() = assertFalse(trusted(pkg = null))

    @Test
    fun differentCertIsRejected() = assertFalse(trusted(certs = setOf("bb")))

    @Test
    fun emptyCertsAreRejected() = assertFalse(trusted(certs = emptySet(), own = emptySet()))

    @Test
    fun sameVersionIsRejected() = assertFalse(trusted(candidateVersion = 5))

    @Test
    fun olderVersionIsRejected() = assertFalse(trusted(candidateVersion = 4))
}
