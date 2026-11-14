package home.control.app.server

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IdentityTest {

    @Test
    fun parsesFullPayload() {
        val json = """{"app":"home-control","name":"Casa","androidApp":{"versionCode":7}}"""
        assertEquals(Identity("Casa", 7), Identity.parse(json))
    }

    @Test
    fun nullAndroidAppMeansNoApkVersion() {
        val json = """{"app":"home-control","name":"Casa","androidApp":null}"""
        assertEquals(Identity("Casa", null), Identity.parse(json))
    }

    @Test
    fun nullVersionCodeMeansNoApkVersion() {
        val json = """{"app":"home-control","name":"Casa","androidApp":{"versionCode":null}}"""
        assertEquals(Identity("Casa", null), Identity.parse(json))
    }

    @Test
    fun rejectsOtherApp() {
        assertNull(Identity.parse("""{"app":"other","name":"Casa","androidApp":null}"""))
    }

    @Test
    fun rejectsMissingApp() {
        assertNull(Identity.parse("""{"name":"Casa"}"""))
    }

    @Test
    fun rejectsNonJson() {
        assertNull(Identity.parse("<html>nope</html>"))
    }
}
