import { hashToken, logout } from "../auth/sessions.js";
import type { ServiceDeps } from "./deps.js";

/** Ends one session and announces it, so the session's camera viewers are cut. */
export async function signOut(deps: Pick<ServiceDeps, "prisma" | "sessionEvents">, token: string): Promise<void> {
  await logout(deps.prisma, token);
  deps.sessionEvents.emit("sessionEnded", hashToken(token));
}
