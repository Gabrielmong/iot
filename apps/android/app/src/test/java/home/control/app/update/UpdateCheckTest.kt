package home.control.app.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckTest {

    @Test
    fun newerServerBuildIsAnUpdate() = assertTrue(updateAvailable(own = 5, server = 6))

    @Test
    fun sameBuildIsNotAnUpdate() = assertFalse(updateAvailable(own = 6, server = 6))

    @Test
    fun olderServerBuildIsNotAnUpdate() = assertFalse(updateAvailable(own = 7, server = 6))

    @Test
    fun noOfferedBuildIsNotAnUpdate() = assertFalse(updateAvailable(own = 5, server = null))
}
