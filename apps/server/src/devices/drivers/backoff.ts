export type FailureKind = "transient" | "auth";

export interface BackoffOptions {
  /** First transient delay; doubles per consecutive failure. */
  initialMs: number;
  maxMs: number;
  /** Fixed delay after an authentication failure (wrong key or credentials). */
  authRetryMs: number;
}

export const RECONNECT_MAX_MS = 60_000;
export const AUTH_RETRY_MS = 60_000;

/** Delays between reconnect attempts: exponential up to 60 s, and 60 s after an auth failure. */
export class Backoff {
  private readonly opts: BackoffOptions;
  private failures = 0;

  constructor(opts: Partial<BackoffOptions> = {}) {
    this.opts = { initialMs: 1000, maxMs: RECONNECT_MAX_MS, authRetryMs: AUTH_RETRY_MS, ...opts };
  }

  next(kind: FailureKind): number {
    if (kind === "auth") return this.opts.authRetryMs;
    const delay = Math.min(this.opts.maxMs, this.opts.initialMs * 2 ** this.failures);
    this.failures++;
    return delay;
  }

  reset(): void {
    this.failures = 0;
  }
}
