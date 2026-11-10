import type { IncomingHttpHeaders } from "node:http";
import { checkSession, hashToken } from "../../auth/sessions.js";
import type { User } from "../../generated/prisma/client.js";
import { httpContext } from "../../graphql/context.js";
import type { ServiceDeps } from "../../services/deps.js";
import type { DeviceRow } from "../../services/device-rows.js";
import { announceExpiry } from "../../services/session-events.js";
import { visibleCamera } from "../camera-access.js";

export interface CameraAccess {
  user: User;
  token: string;
  /** The session's token hash (identifies the session for revocation). */
  sessionKey: string;
  device: DeviceRow;
}

/** 401: no valid session. 404: not a camera the user may see (never 403, so existence does not leak). */
export type CameraAuth = { ok: true; access: CameraAccess } | { ok: false; status: 401 | 404 };

type Deps = Pick<ServiceDeps, "prisma" | "manager" | "pubsub" | "now" | "sessionEvents">;

/**
 * An HTTP request: the Bearer token's session slides, unless the request carries
 * `x-home-background: 1` (then it is only checked), exactly as for GraphQL.
 */
export async function authorizeRequest(deps: ServiceDeps, headers: IncomingHttpHeaders, deviceId: string): Promise<CameraAuth> {
  const ctx = await httpContext(deps, headers);
  return authorize(deps, ctx.user, ctx.token, deviceId);
}

/** A read-only (non-sliding) check of a token: WebSocket connects, and re-checks after a viewer is registered. */
export async function authorizeToken(deps: Deps, token: string, deviceId: string): Promise<CameraAuth> {
  const user = await checkSession(deps.prisma, token, deps.now(), announceExpiry(deps.sessionEvents));
  return authorize(deps, user, token, deviceId);
}

async function authorize(deps: Deps, user: User | null, token: string | null, deviceId: string): Promise<CameraAuth> {
  if (!user || !token) return { ok: false, status: 401 };
  const device = await visibleCamera(deps, user, deviceId);
  if (!device) return { ok: false, status: 404 };
  return { ok: true, access: { user, token, sessionKey: hashToken(token), device } };
}
