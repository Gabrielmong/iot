import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { SessionWatch } from "../../graphql/ws/session-watch.js";
import type { ServiceDeps } from "../../services/deps.js";
import { announceExpiry } from "../../services/session-events.js";
import { CLOSE_NO_ACCESS, CLOSE_SESSION, CLOSE_UNAVAILABLE } from "../streams/close-codes.js";
import { requestPath } from "../../upgrades.js";
import { qualityOf, streamFor, type StreamQuality } from "./stream-quality.js";
import type { SessionCameras } from "../streams/session-cameras.js";
import type { ViewerRegistry } from "../streams/viewers.js";
import { failureReason } from "../failure-reason.js";
import { authorizeToken, type CameraAuth } from "./auth.js";
import { authTokenOf, MseInbox } from "./mse-inbox.js";
import { pipeToUpstream } from "./mse-pipe.js";

/** The client's first message must arrive within this. */
export const MSE_AUTH_TIMEOUT_MS = 5_000;
/** Largest client message: clients only send small JSON requests. */
export const MSE_MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;

const MSE_PATH = /^\/api\/cameras\/([^/]+)\/mse$/;

export interface MseOptions {
  authTimeoutMs?: number;
  /** Periodic session re-check per socket. */
  sessionCheckMs?: number;
}

/** The camera id of an MSE WebSocket URL, or null when the URL is not one (or is malformed). Never throws. */
export function mseDeviceId(url: string | undefined): string | null {
  const match = MSE_PATH.exec(requestPath(url) ?? "");
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/**
 * `GET /api/cameras/:id/mse[?quality=sub]` (WebSocket; `sub` pipes the light sub-stream). The first message is `{"authToken": "..."}`: a bad or
 * missing one closes the socket with 4401, a camera the user may not see with 4404. Once authorised,
 * the socket is tracked as a viewer (revocation closes it), watched for session expiry, and piped to
 * go2rtc's MSE stream. Nothing here slides the session.
 */
export class MseEndpoint {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MSE_MAX_CLIENT_MESSAGE_BYTES });

  constructor(
    private readonly deps: ServiceDeps,
    private readonly viewers: ViewerRegistry,
    private readonly sessions: SessionCameras,
    private readonly opts: MseOptions = {},
  ) {}

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, deviceId: string): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => undefined); // e.g. an oversized message: ws closes the socket itself
      this.serve(ws, deviceId, qualityOf(req.url)).catch((err: unknown) => {
        this.deps.log.warn(`cameras: MSE stream for ${deviceId} failed (${failureReason(err)})`);
        close(ws, CLOSE_UNAVAILABLE, "Camera unavailable");
      });
    });
  }

  dispose(): Promise<void> {
    for (const client of this.wss.clients) client.terminate();
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private async serve(ws: WebSocket, deviceId: string, quality: StreamQuality): Promise<void> {
    const inbox = new MseInbox(ws);
    const token = authTokenOf(await inbox.first(this.opts.authTimeoutMs ?? MSE_AUTH_TIMEOUT_MS));
    if (!token) return close(ws, CLOSE_SESSION, "Unauthorized");
    const auth = await authorizeToken(this.deps, token, deviceId);
    if (!auth.ok) return deny(ws, auth);
    if (ws.readyState !== WebSocket.OPEN) return;

    const { user, sessionKey, device } = auth.access;
    const viewer = this.viewers.connected({ userId: user.id, sessionKey, deviceId: device.id, close: (code) => close(ws, code, "Access ended") });
    this.sessions.record(sessionKey, user.id, device.id);
    const watch = new SessionWatch(this.deps.prisma, token, ws, this.deps.now, this.opts.sessionCheckMs, announceExpiry(this.deps.sessionEvents));
    ws.once("close", () => {
      this.viewers.remove(viewer);
      watch.stop();
    });

    // Checked again now that revocation can see this viewer, closing the race with a concurrent revoke.
    const still = await authorizeToken(this.deps, token, deviceId);
    if (!still.ok) return deny(ws, still);
    const names = await this.deps.cameras.streams.ensure(device);
    if (ws.readyState !== WebSocket.OPEN) return;
    pipeToUpstream(ws, inbox, this.deps.cameras.go2rtc.mseUrl(streamFor(names, quality)), this.deps.cameras.go2rtc.authHeaders());
  }
}

function deny(ws: WebSocket, auth: Extract<CameraAuth, { ok: false }>): void {
  if (auth.status === 401) close(ws, CLOSE_SESSION, "Unauthorized");
  else close(ws, CLOSE_NO_ACCESS, "Not found");
}

function close(ws: WebSocket, code: number, reason: string): void {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code, reason);
}
