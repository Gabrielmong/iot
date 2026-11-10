import type { MediaCutter } from "./media-cut.js";
import type { Viewer, ViewerRegistry } from "./viewers.js";

export interface ViewerCutDeps {
  viewers: ViewerRegistry;
  media: Pick<MediaCutter, "cut">;
  log: Pick<Console, "warn">;
}

/** A viewer to cut and the close code its socket (if any) gets. */
export type Cut = { viewer: Viewer; code: number };

export interface ViewerCutter {
  /**
   * Drops the viewers and closes their sockets (MSE) at once, then ends the media of their cameras and
   * of `devices`: go2rtc is restarted (coalesced) when any of them has a consumer other than our own,
   * since go2rtc cannot drop a stream's consumers otherwise. Never throws.
   */
  cut(cuts: Cut[], devices?: Iterable<string>): void;
}

export function createViewerCutter(deps: ViewerCutDeps): ViewerCutter {
  return {
    cut(cuts, extra = []) {
      const devices = new Set<string>(extra);
      for (const { viewer, code } of cuts) {
        deps.viewers.remove(viewer);
        try {
          viewer.close?.(code);
        } catch {
          deps.log.warn(`cameras: could not close a viewer of ${viewer.deviceId}`);
        }
        devices.add(viewer.deviceId);
      }
      if (devices.size) void deps.media.cut(devices).catch(() => deps.log.warn("cameras: could not end revoked media"));
    },
  };
}
