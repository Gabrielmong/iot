import express, { type RequestHandler } from "express";
import { MAX_BODY_BYTES } from "../../http.js";
import type { ServiceDeps } from "../../services/deps.js";
import type { SessionCameras } from "../streams/session-cameras.js";
import type { ViewerRegistry } from "../streams/viewers.js";
import { authorizeRequest, authorizeToken } from "./auth.js";
import { fail, guarded } from "./respond.js";
import { qualityOf, streamFor } from "./stream-quality.js";

/**
 * `POST /:id/webrtc[?quality=sub]` (body: an `application/sdp` offer): go2rtc's answer for the camera's
 * live stream (or its light sub-stream).
 * The viewer is tracked, then access is checked again before the answer is sent, so a revocation that
 * raced the request either sees the viewer or fails that check.
 */
export function webrtcRoute(deps: ServiceDeps, viewers: ViewerRegistry, sessions: SessionCameras): RequestHandler[] {
  const handler = guarded(deps.log, "webrtc signalling", async (req, res) => {
    const deviceId = String(req.params.id);
    const auth = await authorizeRequest(deps, req.headers, deviceId);
    if (!auth.ok) return fail(res, auth.status);
    const offer: unknown = req.body;
    if (typeof offer !== "string" || offer.trim() === "") return fail(res, 400);

    const { user, token, sessionKey, device } = auth.access;
    const names = await deps.cameras.streams.ensure(device);
    const answer = await deps.cameras.go2rtc.webrtcAnswer(streamFor(names, qualityOf(req.originalUrl)), offer);
    const viewer = viewers.signalled({ userId: user.id, sessionKey, deviceId: device.id });
    sessions.record(sessionKey, user.id, device.id);
    const still = await authorizeToken(deps, token, deviceId);
    if (!still.ok) {
      viewers.remove(viewer);
      return fail(res, still.status);
    }
    res.status(200).set("cache-control", "no-store").type("application/sdp").send(answer);
  });
  return [express.text({ type: "application/sdp", limit: MAX_BODY_BYTES }), handler];
}
