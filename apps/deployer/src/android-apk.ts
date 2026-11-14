import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GitHub } from './github.js';

export interface SyncOptions {
  dir: string;
  github: Pick<GitHub, 'latestAndroidRelease' | 'downloadAsset'>;
  log: (msg: string) => void;
}

function heldVersion(dir: string): number {
  try {
    const { versionCode } = JSON.parse(readFileSync(path.join(dir, 'home.json'), 'utf8')) as { versionCode?: unknown };
    return Number.isInteger(versionCode) && (versionCode as number) > 0 && existsSync(path.join(dir, 'home.apk'))
      ? (versionCode as number)
      : 0;
  } catch {
    return 0;
  }
}

/** Atomic-ish write: temp file, then rename over the target. */
function replaceFile(target: string, data: Buffer | string): void {
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, target);
}

/**
 * Keeps `<dir>/home.apk` + `home.json` at the newest `android-v<n>` release. A failure leaves the
 * previous pair as it was and is only logged; the caller never needs to handle it.
 */
export async function syncAndroidApk({ dir, github, log }: SyncOptions): Promise<void> {
  try {
    const release = await github.latestAndroidRelease();
    if (!release || release.versionCode <= heldVersion(dir)) return;
    const apk = await github.downloadAsset(release.assetId);
    mkdirSync(dir, { recursive: true });
    replaceFile(path.join(dir, 'home.apk'), apk);
    replaceFile(path.join(dir, 'home.json'), JSON.stringify({ versionCode: release.versionCode }));
    log(`Android APK ${release.versionCode} is ready to offer`);
  } catch (e) {
    for (const f of ['home.apk.tmp', 'home.json.tmp']) rmSync(path.join(dir, f), { force: true });
    log(`Couldn't fetch the Android APK: ${e instanceof Error ? e.message : String(e)}`);
  }
}
