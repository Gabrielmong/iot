import { Backoff, type BackoffOptions, type FailureKind } from "./backoff.js";
import { RetryTimer } from "./retry-timer.js";

export interface PollerOptions {
  intervalMs: number;
  backoff?: Partial<BackoffOptions>;
}

/**
 * Calls `poll` every interval. After a failure (classified by `onError`) the next poll waits for the
 * backoff, starting at the interval and doubling up to 60 s, or 60 s after an auth failure.
 */
export class Poller {
  private readonly backoff: Backoff;
  private readonly timer = new RetryTimer();
  private stopped = true;
  private running = false;
  private again = false;

  constructor(
    private readonly poll: () => Promise<void>,
    private readonly onError: (err: unknown) => FailureKind,
    private readonly opts: PollerOptions,
  ) {
    this.backoff = new Backoff({ initialMs: opts.intervalMs, ...opts.backoff });
  }

  start(): void {
    this.stopped = false;
    void this.run();
  }

  /** Polls as soon as possible (after a poll already in flight). */
  pollNow(): void {
    if (this.stopped) return;
    if (this.running) this.again = true;
    else void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.timer.cancel();
  }

  private async run(): Promise<void> {
    if (this.stopped || this.running) return;
    this.timer.cancel();
    this.running = true;
    let delay = this.opts.intervalMs;
    try {
      await this.poll();
      this.backoff.reset();
    } catch (err) {
      delay = this.backoff.next(this.onError(err));
    } finally {
      this.running = false;
    }
    if (this.stopped) return;
    if (this.again) {
      this.again = false;
      void this.run();
    } else {
      this.timer.schedule(delay, () => void this.run());
    }
  }
}
