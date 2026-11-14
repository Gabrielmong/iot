package home.control.app.update

/** True when the server offers an APK newer than the installed one. */
fun updateAvailable(own: Int, server: Int?): Boolean = server != null && server > own
