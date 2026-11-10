import type { RequestHandler } from "express";
import type { ServiceDeps } from "../../services/deps.js";
import type { ThumbnailCache } from "../thumbnails/cache.js";
import { authorizeRequest } from "./auth.js";
import { fail, guarded } from "./respond.js";

/** `GET /:id/thumbnail.jpg`: the camera's latest frame (at most 10 s old) and its age in `X-Frame-Age`. */
export function thumbnailRoute(deps: ServiceDeps, cache: ThumbnailCache): RequestHandler {
  return guarded(deps.log, "thumbnail", async (req, res) => {
    const auth = await authorizeRequest(deps, req.headers, String(req.params.id));
    if (!auth.ok) return fail(res, auth.status);
    const { device } = auth.access;
    const frame = await cache.get(device.id, async () => {
      const { thumb } = await deps.cameras.streams.ensure(device);
      return deps.cameras.go2rtc.frameJpeg(thumb);
    });
    res
      .status(200)
      .set({ "content-type": "image/jpeg", "x-frame-age": String(cache.ageSeconds(frame)), "cache-control": "private, no-store" })
      .send(frame.jpeg);
  });
}
