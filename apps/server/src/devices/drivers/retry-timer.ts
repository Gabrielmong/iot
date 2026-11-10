/** A single pending timer that can be rescheduled or cancelled. */
export class RetryTimer {
  private timer: NodeJS.Timeout | undefined;

  schedule(ms: number, fn: () => void): void {
    this.cancel();
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
