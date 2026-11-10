import type { RoutineScope, User } from "../generated/prisma/client.js";

type Caller = Pick<User, "id" | "role">;
/** What visibility depends on: scope, owner (PERSONAL) and audience user ids (SHARED). */
export type RoutineFacts = { scope: RoutineScope; ownerId: string | null; audience: string[] };

const isAdmin = (u: Caller) => u.role === "ADMIN";

/** Admins see every routine; a user sees their own personal ones and shared ones they're in the audience of. */
export function canSeeRoutine(user: Caller, r: RoutineFacts): boolean {
  if (isAdmin(user)) return true;
  return r.scope === "PERSONAL" ? r.ownerId === user.id : r.audience.includes(user.id);
}

/** Admins edit everything; a user edits only their own personal routines. */
export function canEditRoutine(user: Caller, r: RoutineFacts): boolean {
  return isAdmin(user) || (r.scope === "PERSONAL" && r.ownerId === user.id);
}

/** On the caller's dashboard: their own personal routines and the shared ones they can see. */
export function onDashboardOf(user: Caller, r: RoutineFacts): boolean {
  return r.scope === "SHARED" ? canSeeRoutine(user, r) : r.ownerId === user.id;
}
