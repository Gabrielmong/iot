import { resolve } from "node:path";
import { Go2rtcHttpError, type Go2rtcApi } from "./api.js";

export type Instance = "ours" | "foreign";

const normalize = (p: string) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));

/**
 * Asks whoever answers on the API port whether it is the go2rtc this run spawned. go2rtc's `GET /api`
 * has no pid, but reports `config_path`, and each run's config lives in its own temp dir. A 401 means
 * it does not know this run's credentials (an orphan or another app). Throws while nothing answers.
 *
 * Threat model: config_path is not a secret by itself, but it sits under a random mkdtemp folder in the
 * per-user temp dir, and this check only runs after Basic auth with random per-run credentials. Another
 * OS user can learn neither; a same-user attacker already has full access to this server's files.
 */
export async function checkInstance(api: Pick<Go2rtcApi, "info">, configPath: string, timeoutMs: number): Promise<Instance> {
  try {
    const info = await api.info(timeoutMs);
    return info.config_path !== undefined && normalize(info.config_path) === normalize(configPath) ? "ours" : "foreign";
  } catch (err) {
    if (err instanceof Go2rtcHttpError && err.status === 401) return "foreign";
    throw err;
  }
}
