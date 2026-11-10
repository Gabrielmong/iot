import { checkSessionHash } from "../auth/sessions.js";
import type { User } from "../generated/prisma/client.js";
import { getVisibleDevice } from "../services/device-detail.js";
import type { ServiceDeps } from "../services/deps.js";
import { announceExpiry } from "../services/session-events.js";
import type { DeviceRow } from "../services/device-rows.js";
import type { ViewerStanding } from "./streams/viewer-sweep.js";
import type { Viewer } from "./streams/viewers.js";

/** The camera if the user may see it (adopted, a camera, and granted unless admin); otherwise null. Read fresh from the DB. */
export async function visibleCamera(deps: Pick<ServiceDeps, "prisma">, user: Pick<User, "id" | "role">, deviceId: string): Promise<DeviceRow | null> {
  const device = await getVisibleDevice(deps, user, deviceId);
  return device?.kind === "CAMERA" ? device : null;
}

/** Whether a user (looked up by id, so a role change counts) may still see the camera. */
export async function userCanView(deps: Pick<ServiceDeps, "prisma">, userId: string, deviceId: string): Promise<boolean> {
  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  return user !== null && (await visibleCamera(deps, user, deviceId)) !== null;
}

/** A tracked viewer's standing now: its session (read-only, never slid) and its camera's visibility. */
/** Whether a session (by token hash) is still valid; read-only, and an expired one is announced. */
export async function sessionAlive(deps: Pick<ServiceDeps, "prisma" | "now" | "sessionEvents">, sessionKey: string): Promise<boolean> {
  return (await checkSessionHash(deps.prisma, sessionKey, deps.now(), announceExpiry(deps.sessionEvents))) !== null;
}

export async function viewerStanding(deps: Pick<ServiceDeps, "prisma" | "now" | "sessionEvents">, viewer: Viewer): Promise<ViewerStanding> {
  const user = await checkSessionHash(deps.prisma, viewer.sessionKey, deps.now(), announceExpiry(deps.sessionEvents));
  if (!user || user.id !== viewer.userId) return "session";
  return (await visibleCamera(deps, user, viewer.deviceId)) ? "ok" : "access";
}
