import type { PrismaClient, User } from "../generated/prisma/client.js";
import type { Problem, RunSnapshot } from "./run-outcome.js";

export type DeviceVisibility = (deviceId: string) => boolean;

/** Admins see every device; users the ones granted to them. */
export async function deviceVisibility(prisma: PrismaClient, user: Pick<User, "id" | "role">): Promise<DeviceVisibility> {
  if (user.role === "ADMIN") return () => true;
  const granted = new Set((await prisma.deviceGrant.findMany({ where: { userId: user.id } })).map((g) => g.deviceId));
  return (id) => granted.has(id);
}

/** A run as a viewer sees it: problems on devices they can't see are only counted (removed devices show to all). */
export function viewRun(run: RunSnapshot, canSee: DeviceVisibility) {
  const shown = (p: Problem) => p.reason === "REMOVED" || canSee(p.deviceId);
  const problems = run.problems.filter(shown);
  return {
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    problems: problems.map((p) => ({ step: p.step, deviceId: p.deviceId, deviceName: p.deviceName, reason: p.reason })),
    hiddenProblems: run.problems.length - problems.length,
    currentStep: run.currentStep,
    waitUntil: run.waitUntil?.toISOString() ?? null,
    startedBy: run.startedBy,
  };
}
