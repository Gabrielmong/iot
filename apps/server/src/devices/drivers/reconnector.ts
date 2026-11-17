import { Backoff, type BackoffOptions, type FailureKind } from "./backoff.js";
import { RetryTimer } from "./retry-timer.js";

/** A connection must stay up this long before the backoff resets, so a flapping device keeps backing off. */
export const STABLE_AFTER_MS = 30_000;

/** Schedules reconnect attempts for one persistent connection. */
export class Reconnector {
  private readonly backoff: Backoff;
  private readonly timer = new RetryTimer();
  private readonly stable = new RetryTimer();

  constructor(
    private readonly attempt: () => void,
    opts?: Partial<BackoffOptions>,
  ) {
    this.backoff = new Backoff(opts);
  }

  /** The connection is up; the backoff resets once it has stayed up for STABLE_AFTER_MS. */
  connected(): void {
    this.stable.schedule(STABLE_AFTER_MS, () => this.backoff.reset());
  }

  /** Schedules the next attempt; returns its delay. */
  failed(kind: FailureKind): number {
    this.stable.cancel();
    const delay = this.backoff.next(kind);
    this.timer.schedule(delay, this.attempt);
    return delay;
  }

  /** Starts the backoff over and brings a waiting attempt forward to at most `ms` from now (e.g. after waking the device). */
  soon(ms: number): void {
    this.backoff.reset();
    const remaining = this.timer.remainingMs;
    if (remaining !== undefined && remaining > ms) this.timer.schedule(ms, this.attempt);
  }

  cancel(): void {
    this.timer.cancel();
    this.stable.cancel();
  }
}
