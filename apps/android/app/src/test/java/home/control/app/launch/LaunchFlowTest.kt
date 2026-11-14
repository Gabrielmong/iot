package home.control.app.launch

import home.control.app.server.FoundServer
import home.control.app.server.Identity
import home.control.app.server.ServerAddress
import home.control.app.server.VerifiedServer
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LaunchFlowTest {

    private val saved = ServerAddress("http://192.168.0.100:4000")
    private val other = ServerAddress("http://192.168.0.101:4000")
    private val third = ServerAddress("http://192.168.0.102:4000")
    private val unreachable = ServerAddress("http://172.17.0.1:4000")
    private val identity = Identity("Casa", 3)

    private val savedCalls = mutableListOf<ServerAddress>()
    private val checked = mutableListOf<ServerAddress>()
    private var searches = 0

    private fun flow(
        stored: ServerAddress?,
        answering: Set<ServerAddress>,
        found: List<FoundServer> = emptyList(),
    ) = LaunchFlow(
        load = { stored },
        save = { savedCalls += it },
        check = { checked += it; if (it in answering) identity else null },
        search = { searches++; found },
    )

    private fun found(name: String, first: ServerAddress, vararg rest: String) =
        FoundServer(name, listOf(first) + rest.map(::ServerAddress))

    @Test
    fun savedAddressThatAnswersIsLoadedWithoutSearching() = runTest {
        val result = flow(saved, setOf(saved)).run()
        assertEquals(LaunchResult.Load(saved, identity), result)
        assertEquals(0, searches)
        assertTrue(savedCalls.isEmpty())
    }

    @Test
    fun singleFoundServerIsLoadedAndSaved() = runTest {
        val result = flow(saved, setOf(other), listOf(found("Casa", other))).run()
        assertEquals(LaunchResult.Load(other, identity), result)
        assertEquals(listOf(other), savedCalls)
    }

    @Test
    fun aFailingFirstCandidateFallsThroughToTheNextThatAnswers() = runTest {
        val result = flow(null, setOf(other), listOf(found("Casa", unreachable, other.origin))).run()
        assertEquals(LaunchResult.Load(other, identity), result)
        assertEquals(listOf(other), savedCalls)
        assertEquals(listOf(unreachable, other), checked)
    }

    @Test
    fun candidatesAfterTheFirstAnsweringOneAreNotTried() = runTest {
        flow(null, setOf(other, third), listOf(found("Casa", other, third.origin))).run()
        assertEquals(listOf(other), checked)
    }

    @Test
    fun aServerWithNoAnsweringCandidateIsUnreachable() = runTest {
        assertEquals(LaunchResult.Unreachable, flow(null, emptySet(), listOf(found("Casa", unreachable, other.origin))).run())
        assertTrue(savedCalls.isEmpty())
    }

    @Test
    fun severalFoundServersAreOfferedAndNothingIsSaved() = runTest {
        val servers = listOf(found("A", other), found("B", third))
        val result = flow(saved, setOf(other, third), servers).run()
        val expected = listOf(VerifiedServer("A", other, identity), VerifiedServer("B", third, identity))
        assertEquals(LaunchResult.Choose(expected), result)
        assertTrue(savedCalls.isEmpty())
    }

    @Test
    fun serversThatVerifyAtTheSameAddressAreDeduplicated() = runTest {
        val servers = listOf(found("Casa", unreachable, other.origin), found("Casa", other))
        val result = flow(null, setOf(other), servers).run()
        assertEquals(LaunchResult.Load(other, identity), result)
        assertEquals(listOf(other), savedCalls)
    }

    @Test
    fun nothingFoundIsUnreachableAndKeepsSavedAddress() = runTest {
        assertEquals(LaunchResult.Unreachable, flow(saved, emptySet()).run())
        assertTrue(savedCalls.isEmpty())
    }

    @Test
    fun noSavedAddressAndNothingFoundIsUnreachable() = runTest {
        assertEquals(LaunchResult.Unreachable, flow(null, emptySet()).run())
        assertEquals(1, searches)
    }
}
