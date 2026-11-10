import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

export const RUN_DIR_PREFIX = "home-go2rtc-";

/**
 * Deletes per-run config folders (they hold API credentials) left by earlier runs that did not stop
 * cleanly. Keeps `current`. Never throws.
 */
export function removeStaleRunDirs(parent: string, current: string, log: Pick<Console, "warn">): void {
  let names: string[];
  try {
    names = readdirSync(parent).filter((n) => n.startsWith(RUN_DIR_PREFIX));
  } catch {
    return log.warn("go2rtc: could not list old run folders");
  }
  for (const name of names) {
    const dir = join(parent, name);
    if (resolve(dir) === resolve(current)) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      log.warn(`go2rtc: could not remove old run folder ${name} (${(err as NodeJS.ErrnoException).code ?? "error"})`);
    }
  }
}
