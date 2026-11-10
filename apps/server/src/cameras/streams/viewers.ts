/**
 * How long a WebRTC viewer is tracked after it last signalled. It only bounds memory for clients that
 * vanish: until then a viewer leaves only by revocation (events or the sweep).
 */
export const WEBRTC_VIEWER_TTL_MS = 10 * 60_000;

export type ViewerKind = "webrtc" | "mse";

export interface Viewer {
  userId: string;
  /** The session's token hash: unique per session, and still known after the session row is gone. */
  sessionKey: string;
  deviceId: string;
  kind: ViewerKind;
  /** Closes the viewer's own connection (MSE sockets), with a WebSocket close code. */
  close?: (code: number) => void;
}

type Tracked = Viewer & { expiresAt: number };

/**
 * Who is watching which camera. WebRTC viewers are kept for WEBRTC_VIEWER_TTL_MS after each signal;
 * MSE viewers until their socket goes (the caller removes them).
 */
export class ViewerRegistry {
  private readonly viewers = new Set<Tracked>();

  constructor(
    private readonly now: () => number,
    private readonly webrtcTtlMs = WEBRTC_VIEWER_TTL_MS,
  ) {}

  /** Tracks (or refreshes) a WebRTC viewer of one session and camera. */
  signalled(v: Omit<Viewer, "kind" | "close">): Viewer {
    const existing = this.live().find((t) => t.kind === "webrtc" && t.sessionKey === v.sessionKey && t.deviceId === v.deviceId);
    if (existing) this.viewers.delete(existing);
    const tracked: Tracked = { ...v, kind: "webrtc", expiresAt: this.now() + this.webrtcTtlMs };
    this.viewers.add(tracked);
    return tracked;
  }

  /** Tracks an MSE viewer until `remove`. */
  connected(v: Omit<Viewer, "kind"> & { close: (code: number) => void }): Viewer {
    const tracked: Tracked = { ...v, kind: "mse", expiresAt: Number.POSITIVE_INFINITY };
    this.viewers.add(tracked);
    return tracked;
  }

  remove(viewer: Viewer): void {
    this.viewers.delete(viewer as Tracked);
  }

  /** Current viewers matching `match`. */
  find(match: (v: Viewer) => boolean): Viewer[] {
    return this.live().filter(match);
  }

  private live(): Tracked[] {
    const now = this.now();
    for (const v of this.viewers) if (v.expiresAt <= now) this.viewers.delete(v);
    return [...this.viewers];
  }
}
