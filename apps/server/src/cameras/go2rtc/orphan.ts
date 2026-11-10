import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readPidFile, removePidFile } from "./pid-file.js";
import { processImageName } from "./process-image.js";

const EXIT_WAIT_MS = 3_000;
const EXIT_POLL_MS = 50;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A hard-killed server (Windows has no process-group cleanup) leaves go2rtc running on :1984 with the
 * old credentials. Kill the process recorded in the pid file, but only when it is still running the
 * configured binary, so a reused pid never takes down an unrelated process. May throw (e.g. the pid
 * file cannot be removed); the caller must not let that stop startup.
 */
export async function killOrphan(pidFile: string, command: string, log: Pick<Console, "info" | "warn">): Promise<void> {
  const pid = readPidFile(pidFile);
  if (pid === undefined || pid === process.pid) return removePidFile(pidFile);
  const image = await processImageName(pid);
  if (!image || image.toLowerCase() !== basename(command).toLowerCase()) return removePidFile(pidFile);

  try {
    process.kill(pid);
  } catch {
    return removePidFile(pidFile);
  }
  for (let waited = 0; isAlive(pid) && waited < EXIT_WAIT_MS; waited += EXIT_POLL_MS) await delay(EXIT_POLL_MS);
  if (isAlive(pid)) return log.warn(`could not kill orphaned go2rtc (pid ${pid})`);
  log.info(`killed orphaned go2rtc (pid ${pid})`);
  removePidFile(pidFile);
}
