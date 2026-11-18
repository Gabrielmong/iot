import type { IncomingHttpHeaders } from "node:http";
import { buildContext, tokenFromAuthHeader, type Ctx } from "../auth/context.js";
import { checkSession } from "../auth/sessions.js";
import type { User } from "../generated/prisma/client.js";
import type { ServiceDeps } from "../services/deps.js";
import { announceExpiry } from "../services/session-events.js";
import type { SessionWatch } from "./ws/session-watch.js";

/** Sent by the web app on requests the user did not make (e.g. refetches after devicesChanged). */
export const BACKGROUND_HEADER = "x-home-background";

/** Per-operation context: the signed-in user (if any), the raw token, and the services' deps. */
export type ApiContext = Ctx & {
  token: string | null;
  deps: ServiceDeps;
  /** Set on WebSocket operations: re-checks the session without sliding it. */
  watch?: SessionWatch;
  /** The HTTP peer's address (unset on WebSocket operations). */
  remoteAddress?: string;
};

/**
 * HTTP context. A user's own request slides the session; a background request (BACKGROUND_HEADER: 1)
 * only validates it, so an idle shared screen still expires.
 */
export async function httpContext(deps: ServiceDeps, headers: IncomingHttpHeaders, remoteAddress?: string): Promise<ApiContext> {
  const token = tokenFromAuthHeader(headers.authorization);
  if (headers[BACKGROUND_HEADER] === "1") {
    const user = token ? await checkSession(deps.prisma, token, deps.now(), announceExpiry(deps.sessionEvents)) : null;
    return { ...sessionContext(deps, user, token), remoteAddress };
  }
  const ctx = await buildContext(deps, token, deps.now(), announceExpiry(deps.sessionEvents));
  return { ...ctx, token, deps, remoteAddress };
}

/** Context for a session that was checked without sliding (background HTTP and WebSocket). */
export function sessionContext(deps: ServiceDeps, user: User | null, token: string | null, watch?: SessionWatch): ApiContext {
  const { prisma, manager, pubsub } = deps;
  return { prisma, manager, pubsub, deps, user, isAdmin: user?.role === "ADMIN", token: user ? token : null, watch };
}
