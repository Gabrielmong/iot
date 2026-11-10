import { checkSession, type ExpiryListener } from "../../auth/sessions.js";
import type { PrismaClient, User } from "../../generated/prisma/client.js";
import type { Clock } from "../../services/deps.js";

/** Close code for a WebSocket whose session expired, was logged out, or never existed. */
export const SESSION_CLOSE_CODE = 4401;
/** How often an open socket's session is re-checked, besides on each event. */
export const SESSION_CHECK_MS = 30_000;

type Closable = { close(code: number, reason: string): void };

/**
 * Keeps one WebSocket honest about its session: re-checks it periodically and whenever an event is
 * about to be delivered, and closes the socket with 4401 once it is no longer valid. Checks are
 * read-only, so deliveries and keep-alives never extend an idle shared screen's session.
 */
export class SessionWatch {
  private readonly timer: NodeJS.Timeout;
  private closed = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly token: string,
    private readonly socket: Closable,
    private readonly now: Clock,
    intervalMs = SESSION_CHECK_MS,
    /** Told when this watch finds the session expired (e.g. to cut its camera streams). Must not throw. */
    private readonly onExpired?: ExpiryListener,
  ) {
    this.timer = setInterval(() => void this.check().catch(() => undefined), intervalMs);
    this.timer.unref();
  }

  /** The session's user right now, or null (and the socket is closed) when it is no longer valid. */
  async check(): Promise<User | null> {
    if (this.closed) return null;
    const user = await checkSession(this.prisma, this.token, this.now(), this.onExpired);
    if (!user) this.expire();
    return user;
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private expire(): void {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.socket.close(SESSION_CLOSE_CODE, "Session expired");
  }
}
