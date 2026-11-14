import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ApkInfo {
  versionCode: number;
  apkPath: string;
}

/**
 * The Android app published in `dir` (`home.apk` plus `home.json` = `{ "versionCode": n }`), or null unless
 * both exist and the version is a positive integer. Read per request: the files change under a running server.
 */
export function readApkInfo(dir: string | undefined): ApkInfo | null {
  if (!dir) return null;
  const apkPath = join(dir, "home.apk");
  const jsonPath = join(dir, "home.json");
  if (!existsSync(apkPath) || !existsSync(jsonPath)) return null;
  try {
    const versionCode = (JSON.parse(readFileSync(jsonPath, "utf8")) as { versionCode?: unknown } | null)?.versionCode;
    return typeof versionCode === "number" && Number.isInteger(versionCode) && versionCode > 0 ? { versionCode, apkPath } : null;
  } catch {
    return null;
  }
}
