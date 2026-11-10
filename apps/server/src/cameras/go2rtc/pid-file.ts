import { lstatSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "./repo-root.js";

/**
 * Fixed location, so a run can find a go2rtc left behind by a hard-killed previous run. It lives in the
 * app's own logs folder (writable by the service account only), not the shared temp dir.
 */
export const DEFAULT_PID_FILE = join(REPO_ROOT, "logs", "run", "go2rtc.pid");

function lstatOrUndefined(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/**
 * Records `pid`. Never follows a link: anything at `path` that is not a regular file (symlink, junction,
 * directory) is refused and false returned. A regular file is unlinked and recreated exclusively ('wx').
 */
export function writePidFile(path: string, pid: number): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const existing = lstatOrUndefined(path);
  if (existing && !existing.isFile()) return false;
  if (existing) unlinkSync(path);
  writeFileSync(path, String(pid), { encoding: "utf8", flag: "wx" });
  return true;
}

/** The recorded pid; undefined when missing, invalid, or not a regular file. */
export function readPidFile(path: string): number | undefined {
  try {
    if (!lstatSync(path).isFile()) return undefined;
    const pid = Number(readFileSync(path, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

/** Removes the pid file (a link itself, never its target). Throws on anything it cannot remove. */
export function removePidFile(path: string): void {
  rmSync(path, { force: true });
}
