import type { StreamInfo } from "../go2rtc/api.js";

/**
 * Consumers that are the server's own and need no restart: MSE sockets (only our proxy reaches
 * go2rtc's localhost API, and revoked ones are closed by us) and frame.jpeg grabs (short-lived).
 */
const OWN_CONSUMER_FORMATS = new Set(["mse/fmp4", "keyframe"]);

/** At most one go2rtc restart per window, however many revocations arrive. */
export const RESTART_WINDOW_MS = 2_000;

export interface MediaCutDeps {
  streamInfo: (name: string) => Promise<StreamInfo | null>;
  /** The camera's go2rtc stream names this run (the registry's); none for a camera never registered. */
  namesOf: (deviceId: string) => string[];
  /** Restarts go2rtc (ending every media session). */
  restart: () => void;
  log: Pick<Console, "info" | "warn">;
  windowMs?: number;
}

/**
 * Ends the media of cameras whose viewers lost access. go2rtc offers no way to drop a stream's
 * consumers (DELETE and PATCH leave them playing), so when a camera has any consumer that is not our
 * own MSE proxy or a frame grab, or that cannot be told apart, go2rtc is restarted. With no such
 * consumer nothing plays and nothing is done. Restarts are coalesced: one now, and any further request
 * inside the window waits for its end and then checks again (or restarts if forced).
 */
export class MediaCutter {
  private lastRestart = Number.NEGATIVE_INFINITY;
  private timer: NodeJS.Timeout | undefined;
  private readonly deferred = new Set<string>();
  private deferredForce = false;

  constructor(private readonly deps: MediaCutDeps) {}

  private get windowMs(): number {
    return this.deps.windowMs ?? RESTART_WINDOW_MS;
  }

  /** Cuts the cameras' media if anyone else is consuming it. Never rejects. */
  async cut(deviceIds: Iterable<string>): Promise<void> {
    const ids = [...new Set(deviceIds)];
    if (ids.length && (await this.hasForeignConsumers(ids))) this.restartSoon(ids);
  }

  /** Whether any of the cameras' streams has a consumer that is not ours; true when that cannot be told. */
  async hasForeignConsumers(deviceIds: string[]): Promise<boolean> {
    const names = deviceIds.flatMap((id) => this.deps.namesOf(id));
    const infos = await Promise.all(names.map((name) => this.deps.streamInfo(name).catch(() => undefined)));
    if (infos.includes(undefined)) {
      this.deps.log.warn("cameras: could not read go2rtc's stream consumers; restarting it to be safe");
      return true;
    }
    return infos.some((info) => info?.consumers.some((c) => !OWN_CONSUMER_FORMATS.has(c.formatName ?? "")));
  }

  /** Restarts go2rtc now, or at the end of the current window (re-checking `deviceIds` then, unless `force`). */
  restartSoon(deviceIds: string[], force = false): void {
    const wait = this.lastRestart + this.windowMs - Date.now();
    if (wait <= 0) return this.restartNow();
    for (const id of deviceIds) this.deferred.add(id);
    this.deferredForce ||= force;
    this.timer ??= setTimeout(() => this.runDeferred(), wait);
    this.timer.unref();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private restartNow(): void {
    this.lastRestart = Date.now();
    this.deps.log.info("cameras: restarting go2rtc to end revoked media sessions");
    try {
      this.deps.restart();
    } catch {
      this.deps.log.warn("cameras: go2rtc restart failed");
    }
  }

  private runDeferred(): void {
    this.timer = undefined;
    const ids = [...this.deferred];
    const force = this.deferredForce;
    this.deferred.clear();
    this.deferredForce = false;
    if (force) return this.restartNow();
    void this.cut(ids).catch(() => this.deps.log.warn("cameras: deferred media cut failed"));
  }
}
