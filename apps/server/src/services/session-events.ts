import { EventEmitter } from "node:events";

/**
 * Fired after sessions end, so live camera viewers can be cut. Listeners run synchronously inside the
 * mutation that ended the session and must never throw.
 */
export interface SessionEvents {
  /** One session ended (logout, or expiry seen by a session watch). Payload: its token hash. */
  sessionEnded: [tokenHash: string];
  /** Every session of a user was deleted (role or PIN change, user deleted). */
  sessionsRevoked: [userId: string];
}

export interface SessionEventSource {
  on<K extends keyof SessionEvents>(event: K, listener: (...args: SessionEvents[K]) => void): this;
  off<K extends keyof SessionEvents>(event: K, listener: (...args: SessionEvents[K]) => void): this;
  emit<K extends keyof SessionEvents>(event: K, ...args: SessionEvents[K]): boolean;
}

/** An expiry listener that announces the session's end (so its camera streams are cut). */
export const announceExpiry =
  (events: SessionEventSource) =>
  (tokenHash: string): void =>
    void events.emit("sessionEnded", tokenHash);

export const createSessionEvents = (): SessionEventSource => new EventEmitter() as SessionEventSource;
