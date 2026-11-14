package home.control.app.ui

import android.app.AlertDialog
import android.content.Context
import home.control.app.R
import home.control.app.server.VerifiedServer

/** Lists [servers] (name and address); tapping one calls [onPick], dismissing calls [onCancel]. */
fun showChooseServerDialog(
    context: Context,
    servers: List<VerifiedServer>,
    onPick: (VerifiedServer) -> Unit,
    onCancel: () -> Unit = {},
) {
    val rows = servers.map { "${it.name}\n${it.address.origin}" }.toTypedArray()
    AlertDialog.Builder(context, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
        .setTitle(R.string.choose_server_title)
        .setItems(rows) { _, index -> onPick(servers[index]) }
        .setOnCancelListener { onCancel() }
        .show()
}
