import type { PrismaClient, User } from "../generated/prisma/client.js";
import { canSeeRoutine } from "./access.js";
import type { Problem, RunSnapshot } from "./run-outcome.js";

export type DeviceVisibility = (deviceId: string) => boolean;

/** Admins see every device; users the ones granted to them. */
export async function deviceVisibility(prisma: PrismaClient, user: Pick<User, "id" | "role">): Promise<DeviceVisibility> {
  if (user.role === "ADMIN") return () => true;
  const granted = new Set((await prisma.deviceGrant.findMany({ where: { userId: user.id } })).map((g) => g.deviceId));
  return (id) => granted.has(id);
}

export const HIDDEN_ROUTINE_NAME = "Another routine";

/** The names of the routines `user` may see; the others show as "Another routine". */
export type RoutineNameVisibility = (name: string) => boolean;

export async function routineVisibility(prisma: PrismaClient, user: Pick<User, "id" | "role">): Promise<RoutineNameVisibility> {
  if (user.role === "ADMIN") return () => true;
  const rows = await prisma.routine.findMany({ select: { name: true, scope: true, ownerId: true, audience: { select: { userId: true } } } });
  const names = new Set(rows.filter((r) => canSeeRoutine(user, { scope: r.scope, ownerId: r.ownerId, audience: r.audience.map((a) => a.userId) })).map((r) => r.name));
  return (name) => names.has(name);
}

/** A run as a viewer sees it: routine names they may not see are replaced, problems on devices they can't see are only counted (removed devices and problems without a device show to all). */
export function viewRun(run: RunSnapshot, canSee: DeviceVisibility, canSeeRoutineName: RoutineNameVisibility) {
  const routineName = (name: string | null) => (name === null || canSeeRoutineName(name) ? name : HIDDEN_ROUTINE_NAME);
  const shown = (p: Problem) => p.deviceId === null || p.reason === "REMOVED" || canSee(p.deviceId);
  const problems = run.problems.filter(shown);
  return {
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    problems: problems.map((p) => ({ step: p.step, deviceId: p.deviceId, deviceName: p.deviceName, reason: p.reason, routineName: routineName(p.routineName) })),
    hiddenProblems: run.problems.length - problems.length,
    notes: run.notes.map((n) => ({ ...n, routineName: routineName(n.routineName), ranRoutineName: routineName(n.ranRoutineName) })),
    currentStep: run.currentStep,
    currentPath: run.currentPath.map((e) => ({ ...e, routineName: routineName(e.routineName) as string })),
    waitUntil: run.waitUntil?.toISOString() ?? null,
    startedBy: run.startedBy,
  };
}
