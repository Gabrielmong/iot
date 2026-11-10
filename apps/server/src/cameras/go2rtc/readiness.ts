import { setTimeout as delay } from "node:timers/promises";
import type { Instance } from "./identity.js";

export interface ReadinessOptions {
  pollMs: number;
  timeoutMs: number;
  signal: AbortSignal;
}

export type Readiness = "ready" | "foreign" | "gave-up";

/**
 * Polls `probe` (go2rtc's `GET /api`) until something answers. "ready" when it is our instance,
 * "foreign" when another one holds the port, "gave-up" on timeout or abort. Uses node:timers/promises
 * so the poll is independent of the restart backoff's timers.
 */
export async function waitUntilReady(probe: (timeoutMs: number) => Promise<Instance>, opts: ReadinessOptions): Promise<Readiness> {
  const deadline = Date.now() + opts.timeoutMs;
  while (!opts.signal.aborted && Date.now() < deadline) {
    try {
      const instance = await probe(opts.pollMs * 10);
      if (opts.signal.aborted) break;
      return instance === "ours" ? "ready" : "foreign";
    } catch {
      await delay(opts.pollMs, undefined, { signal: opts.signal }).catch(() => undefined);
    }
  }
  return "gave-up";
}
