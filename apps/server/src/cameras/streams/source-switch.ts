import type { CameraEventSource } from "../../services/camera-events.js";
import type { ThumbnailCache } from "../thumbnails/cache.js";
import { CLOSE_SOURCE_CHANGED } from "./close-codes.js";
import type { MediaCutter } from "./media-cut.js";
import type { StreamRegistry } from "./registry.js";
import type { ViewerRegistry } from "./viewers.js";

export interface SourceSwitchDeps {
  cameraEvents: CameraEventSource;
  viewers: ViewerRegistry;
  media: Pick<MediaCutter, "hasForeignConsumers" | "restartSoon">;
  streams: Pick<StreamRegistry, "release">;
  thumbnails: Pick<ThumbnailCache, "evict">;
  log: Pick<Console, "warn">;
}

/**
 * Moves a camera's viewers to its new stream source: its cached frame is dropped, its streams are
 * released (so the next request registers the new source), and only then are its MSE sockets closed
 * with a "reconnect" code, so a reconnect cannot attach to the old registration. go2rtc is restarted
 * (coalesced) when anyone else, e.g. WebRTC, was consuming, since only a restart ends their media; they
 * then re-signal. Never throws. Returns a detach function.
 */
export function attachSourceSwitch(deps: SourceSwitchDeps): () => void {
  const onSourceChanged = (deviceId: string) => {
    deps.thumbnails.evict(deviceId);
    void switchMedia(deps, deviceId).catch(() => deps.log.warn(`cameras: switching the source of camera ${deviceId} failed`));
  };
  deps.cameraEvents.on("sourceChanged", onSourceChanged);
  return () => void deps.cameraEvents.off("sourceChanged", onSourceChanged);
}

async function switchMedia(deps: SourceSwitchDeps, deviceId: string): Promise<void> {
  // Consumers are read before the release: go2rtc forgets the stream (not its consumers) on delete.
  const playing = await deps.media.hasForeignConsumers([deviceId]);
  await deps.streams.release(deviceId);
  closeMseViewers(deps, deviceId);
  if (playing) deps.media.restartSoon([], true);
}

/** Only MSE viewers have a socket of ours to close; WebRTC ones stay tracked and re-signal after the restart. */
function closeMseViewers(deps: SourceSwitchDeps, deviceId: string): void {
  for (const v of deps.viewers.find((x) => x.deviceId === deviceId && x.close !== undefined)) {
    deps.viewers.remove(v);
    try {
      v.close?.(CLOSE_SOURCE_CHANGED);
    } catch {
      deps.log.warn(`cameras: could not close a viewer of ${deviceId}`);
    }
  }
}
