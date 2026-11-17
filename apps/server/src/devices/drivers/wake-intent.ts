/** How long after a wake request a TV coming up dark still gets its POWER press. */
export const WAKE_INTENT_MS = 2 * 60_000;

/**
 * Remembers that someone asked a TV to turn on by Wake-on-LAN. Some TVs wake only their network (screen
 * still off), so the first power report after reconnecting decides whether POWER must still be pressed.
 */
export class WakeIntent {
  private requestedAt: number | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  request(): void {
    this.requestedAt = this.now();
  }

  /** Whether this power report should be answered with a POWER press; any report ends the intent. */
  consume(on: boolean): boolean {
    const at = this.requestedAt;
    this.requestedAt = undefined;
    return !on && at !== undefined && this.now() - at <= WAKE_INTENT_MS;
  }
}
