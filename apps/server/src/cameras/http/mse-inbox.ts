import { WebSocket, type RawData } from "ws";

/** Messages a client may send before the upstream is open (go2rtc's first request, chiefly). */
const MAX_QUEUED = 16;

export type Message = { data: RawData; isBinary: boolean };

/**
 * A client socket's incoming messages from the moment it connects: the first one (the auth message)
 * is handed out alone; later ones queue until `forwardTo` takes them over, so nothing sent while the
 * session is being checked is lost. A client that floods the queue is closed (1008).
 */
export class MseInbox {
  private readonly queue: Message[] = [];
  private waiting: ((m: Message | null) => void) | undefined;
  private sink: ((m: Message) => void) | undefined;
  private gotFirst = false;

  constructor(private readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => this.take({ data, isBinary }));
    ws.once("close", () => this.waiting?.(null));
  }

  /** The first message, or null if none arrives within `timeoutMs` or the socket closes first. */
  first(timeoutMs: number): Promise<Message | null> {
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(null), timeoutMs);
      const done = (m: Message | null) => {
        clearTimeout(timer);
        this.waiting = undefined;
        resolve(m);
      };
      this.waiting = done;
    });
  }

  /** Sends every queued message to `sink`, then each new one as it arrives. */
  forwardTo(sink: (m: Message) => void): void {
    this.sink = sink;
    for (const m of this.queue.splice(0)) sink(m);
  }

  private take(m: Message): void {
    if (!this.gotFirst) {
      this.gotFirst = true;
      this.waiting?.(m); // with no one waiting, the auth window has passed and the socket is closing
      return;
    }
    if (this.sink) return this.sink(m);
    if (this.queue.length >= MAX_QUEUED) return this.ws.close(1008, "Too many messages");
    this.queue.push(m);
  }
}

/** The `authToken` of a first message `{"authToken": "..."}`, or null. */
export function authTokenOf(m: Message | null): string | null {
  if (!m || m.isBinary) return null;
  try {
    const parsed: unknown = JSON.parse(m.data.toString());
    const token = (parsed as { authToken?: unknown } | null)?.authToken;
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}
