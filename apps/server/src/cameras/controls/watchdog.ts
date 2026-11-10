/** A held arrow repeats its move every 1.5 s; without a repeat for this long, the camera is stopped. */
export const SAFETY_STOP_MS = 4000;

export interface MoveWatchdogOptions {
  timeoutMs: number;
  onExpire: (deviceId: string) => void;
}

/** Stops a moving camera whose client went quiet (released off-screen, lost network, closed tab). */
export class MoveWatchdog {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly opts: MoveWatchdogOptions) {}

  /** A move was sent: (re)start the camera's countdown. */
  touch(deviceId: string): void {
    this.clear(deviceId);
    const timer = setTimeout(() => {
      this.timers.delete(deviceId);
      this.opts.onExpire(deviceId);
    }, this.opts.timeoutMs);
    timer.unref?.();
    this.timers.set(deviceId, timer);
  }

  /** The camera was stopped on purpose. */
  clear(deviceId: string): void {
    clearTimeout(this.timers.get(deviceId));
    this.timers.delete(deviceId);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
