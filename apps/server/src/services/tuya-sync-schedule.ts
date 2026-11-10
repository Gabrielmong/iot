import type { SyncResult } from "./tuya-sync.js";

type Timer = { cancel(): void };

export type TuyaSyncScheduleDeps = {
  sync: () => Promise<SyncResult>;
  /** Whether Tuya cloud credentials are stored; runs are skipped (not failed) until they are. */
  configured: () => Promise<boolean>;
  log: Pick<Console, "info" | "warn">;
  /** 0 turns the schedule off. */
  intervalMs: number;
  /** Lets LAN broadcasts arrive after a start, so broadcasting devices aren't taken for quiet ones. */
  firstDelayMs: number;
  setTimer?: (fn: () => void, ms: number) => Timer;
};

const realTimer = (fn: () => void, ms: number): Timer => {
  const t = setTimeout(fn, ms);
  t.unref();
  return { cancel: () => clearTimeout(t) };
};

/**
 * Runs the Tuya key sync in the background: once shortly after start, then every interval. That
 * keeps keys fresh and re-finds devices that never broadcast (new ones, or ones whose IP changed).
 */
export class TuyaSyncSchedule {
  private timer: Timer | null = null;
  private readonly setTimer: (fn: () => void, ms: number) => Timer;

  constructor(private readonly deps: TuyaSyncScheduleDeps) {
    this.setTimer = deps.setTimer ?? realTimer;
  }

  start(): void {
    if (this.deps.intervalMs <= 0) return;
    this.arm(this.deps.firstDelayMs);
  }

  stop(): void {
    this.timer?.cancel();
    this.timer = null;
  }

  private arm(ms: number): void {
    this.timer = this.setTimer(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    try {
      if (await this.deps.configured()) {
        const { found } = await this.deps.sync();
        if (found.length > 0) this.deps.log.info(`tuya: scheduled sync found devices that don't broadcast: ${found.join(", ")}`);
      }
    } catch (err) {
      this.deps.log.warn(`tuya: scheduled sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this.timer) this.arm(this.deps.intervalMs);
  }
}
