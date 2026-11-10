import { CLOSE_NO_ACCESS, CLOSE_SESSION } from "./close-codes.js";
import type { SessionCameras } from "./session-cameras.js";
import type { Cut, ViewerCutter } from "./viewer-cut.js";
import type { Viewer, ViewerRegistry } from "./viewers.js";

/** How often every tracked viewer's session and access are re-checked. */
export const VIEWER_SWEEP_MS = 5_000;

/** Why a viewer may no longer watch, or "ok". */
export type ViewerStanding = "ok" | "session" | "access";

export interface ViewerSweepDeps {
  viewers: ViewerRegistry;
  cutter: ViewerCutter;
  /** Read-only (non-sliding) check of the viewer's session and of its camera's visibility. */
  standing: (viewer: Viewer) => Promise<ViewerStanding>;
  /** Cameras per session; sessions with a record are checked too, tracked viewer or not. */
  sessions: SessionCameras;
  /** Read-only check that a session (by token hash) is still valid. */
  sessionAlive: (sessionKey: string) => Promise<boolean>;
  log: Pick<Console, "warn">;
  intervalMs?: number;
}

/**
 * Re-checks every viewer (WebRTC and MSE) and every session that was given video, on an interval, so a
 * session that simply expires, or access lost without an event, stops the video within one sweep. A
 * dead session's own cameras are cut (never every camera). Everything found in one sweep is cut
 * together (one media cut, so at most one go2rtc restart). Never throws. Returns `{ sweep, stop }`.
 */
export function startViewerSweep(deps: ViewerSweepDeps): { sweep(): Promise<void>; stop(): void } {
  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const viewers = deps.viewers.find(() => true);
      const keys = deps.sessions.sessions();
      let failed = 0;
      // A failed check (database down) keeps the viewer or session for now; the next sweep checks again.
      const [standings, alive] = await Promise.all([
        Promise.all(viewers.map((v) => deps.standing(v).catch((): ViewerStanding => (failed++, "ok")))),
        Promise.all(keys.map((k) => deps.sessionAlive(k).catch(() => (failed++, true)))),
      ]);
      if (failed) deps.log.warn(`cameras: viewer sweep could not check ${failed} viewer(s) or session(s)`);
      const cuts: Cut[] = [];
      const dead = new Set(keys.filter((_, i) => !alive[i]));
      viewers.forEach((viewer, i) => {
        if (standings[i] === "session") {
          cuts.push({ viewer, code: CLOSE_SESSION });
          dead.add(viewer.sessionKey);
        }
        if (standings[i] === "access") cuts.push({ viewer, code: CLOSE_NO_ACCESS });
      });
      const devices = [...dead].flatMap((key) => [...deps.sessions.take(key)]);
      if (cuts.length || devices.length) deps.cutter.cut(cuts, devices);
    } catch {
      deps.log.warn("cameras: viewer sweep failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void sweep(), deps.intervalMs ?? VIEWER_SWEEP_MS);
  timer.unref();
  return { sweep, stop: () => clearInterval(timer) };
}
