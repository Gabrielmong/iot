export type WakeStatus = "WAKING" | "WOKE" | "FAILED" | "UNCONFIRMED";
export type WakeProgress = { status: WakeStatus; seconds: number | null };
export type WakeStart = { hasIp: boolean; confirmable: boolean; alreadyOn: boolean };

export type WakeTrackerOptions = {
  now: () => number;
  /** Called on every change of a device's progress (not on cancel). */
  onChange: (deviceId: string) => void;
  /** How long a wake is followed before it ends as FAILED / UNCONFIRMED. */
  watchMs?: number;
  /** How long an ended wake's result stays visible. */
  showMs?: number;
};

type Entry = { progress: WakeProgress; startedAt: number; timer: ReturnType<typeof setTimeout> };

/** Follows each PC's latest wake: Waking… → On after n s, Didn't wake, or Wake sent (can't confirm). */
export class WakeTracker {
  private readonly entries = new Map<string, Entry>();
  private readonly watchMs: number;
  private readonly showMs: number;

  constructor(private readonly opts: WakeTrackerOptions) {
    this.watchMs = opts.watchMs ?? 120_000;
    this.showMs = opts.showMs ?? 60_000;
  }

  /** Starts (or restarts) following a wake. */
  start(deviceId: string, s: WakeStart): void {
    if (!s.hasIp) return this.end(deviceId, { status: "UNCONFIRMED", seconds: null });
    if (s.alreadyOn) return this.end(deviceId, { status: "WOKE", seconds: 0 });
    const timeout = () => this.end(deviceId, { status: s.confirmable ? "FAILED" : "UNCONFIRMED", seconds: null });
    this.set(deviceId, { status: "WAKING", seconds: null }, timeout, this.watchMs);
  }

  /** The PC was seen on: a running wake ends as WOKE. */
  sawOn(deviceId: string): void {
    const e = this.entries.get(deviceId);
    if (e?.progress.status !== "WAKING") return;
    this.end(deviceId, { status: "WOKE", seconds: Math.floor((this.opts.now() - e.startedAt) / 1000) });
  }

  /** Drops a device's wake silently (e.g. the device was removed). */
  cancel(deviceId: string): void {
    const e = this.entries.get(deviceId);
    if (e) clearTimeout(e.timer);
    this.entries.delete(deviceId);
  }

  get(deviceId: string): WakeProgress | null {
    return this.entries.get(deviceId)?.progress ?? null;
  }

  stopAll(): void {
    for (const id of [...this.entries.keys()]) this.cancel(id);
  }

  /** Shows an ended result for `showMs`, then clears it. */
  private end(deviceId: string, progress: WakeProgress): void {
    const clear = () => {
      this.entries.delete(deviceId);
      this.opts.onChange(deviceId);
    };
    this.set(deviceId, progress, clear, this.showMs);
  }

  private set(deviceId: string, progress: WakeProgress, then: () => void, ms: number): void {
    const prev = this.entries.get(deviceId);
    if (prev) clearTimeout(prev.timer);
    const startedAt = progress.status === "WAKING" || !prev ? this.opts.now() : prev.startedAt;
    const timer = setTimeout(then, ms);
    timer.unref?.();
    this.entries.set(deviceId, { progress, startedAt, timer });
    this.opts.onChange(deviceId);
  }
}
