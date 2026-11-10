import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Router } from "express";
import type { ServiceDeps } from "../../services/deps.js";
import { sessionAlive, userCanView, viewerStanding } from "../camera-access.js";
import { MediaCutter } from "../streams/media-cut.js";
import { attachRevocation } from "../streams/revocation.js";
import { SessionCameras } from "../streams/session-cameras.js";
import { attachSourceSwitch } from "../streams/source-switch.js";
import { createViewerCutter } from "../streams/viewer-cut.js";
import { startViewerSweep } from "../streams/viewer-sweep.js";
import { ViewerRegistry } from "../streams/viewers.js";
import { ThumbnailCache } from "../thumbnails/cache.js";
import { MseEndpoint, mseDeviceId, type MseOptions } from "./mse-route.js";
import { cameraRouter } from "./router.js";

export interface CameraEndpoints {
  /** The HTTP routes, to mount at CAMERAS_PATH. */
  router: Router;
  /** Takes the upgrade if it is for a camera's MSE socket; returns false otherwise. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  /** Detaches revocation and source switching, stops the viewer sweep and closes the MSE sockets. */
  dispose(): Promise<void>;
}

export interface CameraEndpointOptions extends MseOptions {
  /** How often every viewer is re-checked (default VIEWER_SWEEP_MS). */
  viewerSweepMs?: number;
}

/** Wires the camera endpoints: thumbnail cache, viewer tracking, revocation, source switches and sweep, HTTP routes and the MSE socket. */
export function createCameraEndpoints(deps: ServiceDeps, opts: CameraEndpointOptions = {}): CameraEndpoints {
  const clock = () => deps.now().getTime();
  const thumbnails = new ThumbnailCache(clock);
  const viewers = new ViewerRegistry(clock);
  const sessions = new SessionCameras(() => deps.cameras.streams.deviceIds());
  const media = new MediaCutter({
    streamInfo: (name) => deps.cameras.go2rtc.streamInfo(name),
    namesOf: (deviceId) => deps.cameras.streams.streamNamesOf(deviceId),
    restart: () => deps.cameras.restartGo2rtc(),
    log: deps.log,
  });
  const cutter = createViewerCutter({ viewers, media, log: deps.log });
  const detach = attachRevocation({
    grantEvents: deps.grantEvents,
    sessionEvents: deps.sessionEvents,
    viewers,
    cutter,
    media,
    sessions,
    streams: deps.cameras.streams,
    thumbnails,
    canView: (userId, deviceId) => userCanView(deps, userId, deviceId),
    log: deps.log,
  });
  const detachSwitch = attachSourceSwitch({
    cameraEvents: deps.cameraEvents,
    viewers,
    media,
    streams: deps.cameras.streams,
    thumbnails,
    log: deps.log,
  });
  const sweep = startViewerSweep({
    viewers,
    cutter,
    sessions,
    standing: (v) => viewerStanding(deps, v),
    sessionAlive: (key) => sessionAlive(deps, key),
    log: deps.log,
    intervalMs: opts.viewerSweepMs,
  });
  const mse = new MseEndpoint(deps, viewers, sessions, opts);

  return {
    router: cameraRouter(deps, { thumbnails, viewers, sessions }),
    handleUpgrade(req, socket, head) {
      const deviceId = mseDeviceId(req.url);
      if (deviceId === null) return false;
      mse.handleUpgrade(req, socket, head, deviceId);
      return true;
    },
    async dispose() {
      detach();
      detachSwitch();
      sweep.stop();
      media.dispose();
      await mse.dispose();
    },
  };
}
