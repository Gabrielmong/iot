/** A single pending timer that can be rescheduled or cancelled. */
export class RetryTimer {
  private timer: NodeJS.Timeout | undefined;
  private dueAt = 0;

  /** Milliseconds until the pending run, or undefined when nothing is pending. */
  get remainingMs(): number | undefined {
    return this.timer === undefined ? undefined : Math.max(0, this.dueAt - Date.now());
  }

  schedule(ms: number, fn: () => void): void {
    this.cancel();
    this.dueAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      fn();
    }, ms);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
