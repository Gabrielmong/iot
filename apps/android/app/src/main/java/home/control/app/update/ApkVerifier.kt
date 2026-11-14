package home.control.app.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import java.io.File
import java.security.MessageDigest

/** True only for a newer build of this very app, signed by the same certificate(s). */
fun isTrustedUpdate(
    ownPackage: String,
    ownCertSha256: Set<String>,
    ownVersion: Long,
    candidatePackage: String?,
    candidateCertSha256: Set<String>,
    candidateVersion: Long,
): Boolean = candidatePackage == ownPackage &&
    ownCertSha256.isNotEmpty() &&
    candidateCertSha256 == ownCertSha256 &&
    candidateVersion > ownVersion

/** Checks a downloaded APK against the installed app before it is handed to the installer. */
fun isTrustedApk(context: Context, apk: File): Boolean {
    val pm = context.packageManager
    val own = runCatching { pm.getPackageInfo(context.packageName, certFlag()) }.getOrNull() ?: return false
    val candidate = pm.getPackageArchiveInfo(apk.path, certFlag()) ?: return false
    return isTrustedUpdate(
        ownPackage = context.packageName,
        ownCertSha256 = own.certHashes(),
        ownVersion = PackageInfoCompat.getLongVersionCode(own),
        candidatePackage = candidate.packageName,
        candidateCertSha256 = candidate.certHashes(),
        candidateVersion = PackageInfoCompat.getLongVersionCode(candidate),
    )
}

@Suppress("DEPRECATION")
private fun certFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

@Suppress("DEPRECATION")
private fun PackageInfo.certHashes(): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        signingInfo?.apkContentsSigners
    } else {
        signatures
    }
    return signatures.orEmpty().map { sha256(it.toByteArray()) }.toSet()
}

private fun sha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
