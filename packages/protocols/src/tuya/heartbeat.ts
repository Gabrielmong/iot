export interface HeartbeatOptions {
  intervalMs: number;
  /** How long to wait for each reply. */
  replyTimeoutMs: number;
  send: () => void;
  /** Called once when a reply does not arrive in time; the heartbeat then stops. */
  onMissed: () => void;
}

/** Sends a heartbeat every `intervalMs` and reports the first one left unanswered. */
export class Heartbeat {
  private interval: NodeJS.Timeout | undefined;
  private replyTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: HeartbeatOptions) {}

  start(): void {
    this.stop();
    this.interval = setInterval(() => this.beat(), this.opts.intervalMs);
  }

  /** Records a heartbeat reply. */
  ack(): void {
    clearTimeout(this.replyTimer);
    this.replyTimer = undefined;
  }

  stop(): void {
    clearInterval(this.interval);
    clearTimeout(this.replyTimer);
    this.interval = undefined;
    this.replyTimer = undefined;
  }

  private beat(): void {
    if (this.replyTimer) return; // still waiting on the previous reply
    this.replyTimer = setTimeout(() => {
      this.stop();
      this.opts.onMissed();
    }, this.opts.replyTimeoutMs);
    this.opts.send();
  }
}
