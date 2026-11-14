package home.control.app.server

import org.json.JSONObject

private const val APP_ID = "home-control"

/** What a home server says about itself; [apkVersionCode] is the Android build it offers, if any. */
data class Identity(val name: String, val apkVersionCode: Int?) {

    companion object {
        /** Parses a `/api/identity` body; null when it is not JSON or not a home-control server. */
        fun parse(json: String): Identity? = try {
            val root = JSONObject(json)
            if (root.optString("app") != APP_ID) {
                null
            } else {
                val apk = root.optJSONObject("androidApp")
                Identity(
                    name = root.optString("name"),
                    apkVersionCode = if (apk != null && !apk.isNull("versionCode")) apk.getInt("versionCode") else null,
                )
            }
        } catch (_: Exception) {
            null
        }
    }
}
