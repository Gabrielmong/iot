import type { GrantEventSource } from "../../services/grant-events.js";
import type { SessionEventSource } from "../../services/session-events.js";
import type { ThumbnailCache } from "../thumbnails/cache.js";
import { CLOSE_NO_ACCESS, CLOSE_SESSION } from "./close-codes.js";
import type { MediaCutter } from "./media-cut.js";
import type { SessionCameras } from "./session-cameras.js";
import type { StreamRegistry } from "./registry.js";
import type { ViewerCutter } from "./viewer-cut.js";
import type { Viewer, ViewerRegistry } from "./viewers.js";

export interface RevocationDeps {
  grantEvents: GrantEventSource;
  sessionEvents: SessionEventSource;
  viewers: ViewerRegistry;
  cutter: ViewerCutter;
  media: Pick<MediaCutter, "hasForeignConsumers" | "restartSoon">;
  streams: Pick<StreamRegistry, "release">;
  /** Cameras each session was given video for: an ended session cuts only these. */
  sessions: SessionCameras;
  thumbnails: Pick<ThumbnailCache, "evict">;
  /** Whether the user may still see the camera (fresh from the DB). */
  canView: (userId: string, deviceId: string) => Promise<boolean>;
  log: Pick<Console, "warn">;
}

/**
 * Cuts camera video the moment access may have been lost. It never relies on viewer tracking alone:
 * - a grant change cuts that camera's media (and closes tracked viewers who lost access);
 * - an ended session (logout, role/PIN change, user deleted, expiry found by any check) cuts the media
 *   of the cameras that session (or, for a user, any of their sessions) was given video for, and
 *   closes its tracked sockets; a session that never watched causes no cut, so signing in and out
 *   cannot interrupt anyone else's video;
 * - a removed camera is released, and its media cut.
 * Cutting media means restarting go2rtc when anyone other than our own MSE proxy or a frame grab is
 * consuming (see MediaCutter); everyone else then re-signals. Listeners run inside the emitting
 * mutation, so they never throw: all work is async and failures are logged. Returns a detach function.
 */
export function attachRevocation(deps: RevocationDeps): () => void {
  const cutAll = (viewers: Viewer[], code: number, devices: Iterable<string>) =>
    deps.cutter.cut(viewers.map((viewer) => ({ viewer, code })), devices);

  const onGrantsChanged = safely(deps.log, "grant change", async (deviceId: string) => {
    const viewers = deps.viewers.find((v) => v.deviceId === deviceId);
    // A failed check counts as lost access; the camera's media is cut either way.
    const kept = await Promise.all(viewers.map((v) => deps.canView(v.userId, deviceId).catch(() => false)));
    cutAll(viewers.filter((_, i) => !kept[i]), CLOSE_NO_ACCESS, [deviceId]);
  });
  const onSessionEnded = safely(deps.log, "session end", async (sessionKey: string) => {
    cutAll(deps.viewers.find((v) => v.sessionKey === sessionKey), CLOSE_SESSION, deps.sessions.take(sessionKey));
  });
  const onSessionsRevoked = safely(deps.log, "session revocation", async (userId: string) => {
    cutAll(deps.viewers.find((v) => v.userId === userId), CLOSE_SESSION, deps.sessions.takeUser(userId));
  });
  const onDeviceRemoved = safely(deps.log, "camera removal", async (deviceId: string) => {
    for (const v of deps.viewers.find((x) => x.deviceId === deviceId)) {
      deps.viewers.remove(v);
      v.close?.(CLOSE_NO_ACCESS);
    }
    deps.thumbnails.evict(deviceId);
    deps.sessions.forget(deviceId);
    // Consumers are read before the release: go2rtc forgets the stream (not its consumers) on delete.
    const playing = await deps.media.hasForeignConsumers([deviceId]);
    await deps.streams.release(deviceId);
    if (playing) deps.media.restartSoon([], true);
  });

  deps.grantEvents.on("grantsChanged", onGrantsChanged);
  deps.grantEvents.on("deviceRemoved", onDeviceRemoved);
  deps.sessionEvents.on("sessionEnded", onSessionEnded);
  deps.sessionEvents.on("sessionsRevoked", onSessionsRevoked);
  return () => {
    deps.grantEvents.off("grantsChanged", onGrantsChanged);
    deps.grantEvents.off("deviceRemoved", onDeviceRemoved);
    deps.sessionEvents.off("sessionEnded", onSessionEnded);
    deps.sessionEvents.off("sessionsRevoked", onSessionsRevoked);
  };
}

/** A listener that starts `work` at once and never throws, synchronously or later. */
function safely<A>(log: Pick<Console, "warn">, what: string, work: (arg: A) => Promise<void>): (arg: A) => void {
  return (arg) => {
    try {
      work(arg).catch(() => log.warn(`cameras: revocation after a ${what} failed`));
    } catch {
      log.warn(`cameras: revocation after a ${what} failed`);
    }
  };
}
