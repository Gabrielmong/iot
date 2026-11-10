import type { PairingSession } from "./types.js";

export const PAIRING_TTL_MS = 2 * 60_000;

type Entry = { session: PairingSession; expiresAt: number; timer: NodeJS.Timeout };

/**
 * Open TV pairing exchanges, one per device. Each is closed 2 minutes after it starts, whether or not
 * anyone comes back for it (a closed tab, a lost connection), so no TV is left holding a connection.
 */
export class PendingPairings {
  private readonly entries = new Map<string, Entry>();
  private readonly opening = new Map<string, Promise<PairingSession>>();
  /** Devices whose pairing was cancelled while it was still opening. */
  private readonly cancelledWhileOpening = new Set<string>();

  constructor(private readonly now: () => Date) {}

  /**
   * Opens a session with `open` and tracks it. While one is still opening for the device, a second start
   * shares it: a TV answers one pairing connection at a time, so a second would just hang.
   */
  start(deviceId: string, open: () => Promise<PairingSession>): Promise<PairingSession> {
    const inFlight = this.opening.get(deviceId);
    if (inFlight) return inFlight;
    this.cancelledWhileOpening.delete(deviceId);
    const started = open()
      .then((session) => {
        if (this.cancelledWhileOpening.delete(deviceId)) session.cancel();
        else this.set(deviceId, session);
        return session;
      })
      .finally(() => this.opening.delete(deviceId));
    this.opening.set(deviceId, started);
    return started;
  }

  /** Starts tracking a session; an older one for the device is cancelled. */
  set(deviceId: string, session: PairingSession): void {
    this.cancel(deviceId);
    const timer = setTimeout(() => this.cancel(deviceId), PAIRING_TTL_MS);
    timer.unref();
    this.entries.set(deviceId, { session, expiresAt: this.now().getTime() + PAIRING_TTL_MS, timer });
  }

  /** The live session, or undefined (an expired one is cancelled and forgotten). */
  get(deviceId: string): PairingSession | undefined {
    const entry = this.entries.get(deviceId);
    if (!entry) return undefined;
    if (this.now().getTime() <= entry.expiresAt) return entry.session;
    this.cancel(deviceId);
    return undefined;
  }

  /** Forgets a finished session without cancelling it. */
  take(deviceId: string): void {
    const entry = this.entries.get(deviceId);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(deviceId);
  }

  /** Cancels and forgets the device's session (or the one still opening); false when there was none. */
  cancel(deviceId: string): boolean {
    if (this.opening.has(deviceId)) this.cancelledWhileOpening.add(deviceId);
    const entry = this.entries.get(deviceId);
    if (!entry) return this.opening.has(deviceId);
    this.entries.delete(deviceId);
    clearTimeout(entry.timer);
    entry.session.cancel();
    return true;
  }

  /** Cancels every session, including those still opening (shutdown). */
  cancelAll(): void {
    for (const deviceId of [...this.entries.keys(), ...this.opening.keys()]) this.cancel(deviceId);
  }
}
