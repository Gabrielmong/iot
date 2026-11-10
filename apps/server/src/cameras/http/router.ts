import express, { type Router } from "express";
import type { ServiceDeps } from "../../services/deps.js";
import type { SessionCameras } from "../streams/session-cameras.js";
import type { ViewerRegistry } from "../streams/viewers.js";
import type { ThumbnailCache } from "../thumbnails/cache.js";
import { bodyErrors, fail } from "./respond.js";
import { thumbnailRoute } from "./thumbnail-route.js";
import { webrtcRoute } from "./webrtc-route.js";

/** Mounted at CAMERAS_PATH. The MSE WebSocket is served from the server's upgrade routing instead. */
export const CAMERAS_PATH = "/api/cameras";

/** The camera HTTP endpoints; anything else under the path is a `{code}` 404, never the web app. */
export function cameraRouter(deps: ServiceDeps, parts: { thumbnails: ThumbnailCache; viewers: ViewerRegistry; sessions: SessionCameras }): Router {
  const router = express.Router();
  router.get("/:id/thumbnail.jpg", thumbnailRoute(deps, parts.thumbnails));
  router.post("/:id/webrtc", ...webrtcRoute(deps, parts.viewers, parts.sessions));
  router.use((_req, res) => fail(res, 404));
  router.use(bodyErrors);
  return router;
}
