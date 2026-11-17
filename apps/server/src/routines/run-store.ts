import type { PrismaClient } from "../generated/prisma/client.js";
import type { Problem, RunSnapshot } from "./run-outcome.js";

/** Saves a routine's last run. A routine deleted meanwhile is ignored (returns false). */
export async function saveLastRun(prisma: PrismaClient, routineId: string, run: RunSnapshot): Promise<boolean> {
  const { status, startedAt, endedAt, problems, currentStep, currentPath, waitUntil, startedBy } = run;
  const data = { status, startedAt, endedAt, problems, currentStep, currentPath, waitUntil, startedBy };
  try {
    await prisma.routineRun.upsert({ where: { routineId }, create: { routineId, ...data }, update: data });
    return true;
  } catch (error) {
    if (!(await prisma.routine.findUnique({ where: { id: routineId } }))) return false;
    throw error;
  }
}

type RunRow = Omit<RunSnapshot, "problems" | "currentPath"> & { problems: unknown; currentPath?: unknown };

export function toSnapshot(row: RunRow): RunSnapshot {
  const { status, startedAt, endedAt, currentStep, waitUntil, startedBy } = row;
  // Older runs have problems without `step` or `routineName`, and no `currentPath`.
  const problems = (row.problems as Problem[]).map((p) => ({ ...p, step: p.step ?? 0, routineName: p.routineName ?? null }));
  const currentPath = (row.currentPath as RunSnapshot["currentPath"] | undefined) ?? [];
  return { status, startedAt, endedAt, problems, currentStep, currentPath, waitUntil, startedBy };
}

/** Startup: runs left RUNNING by a previous process were cut off. */
export async function markInterrupted(prisma: PrismaClient, now: Date): Promise<void> {
  await prisma.routineRun.updateMany({ where: { status: "RUNNING" }, data: { status: "INTERRUPTED", endedAt: now, currentStep: null, currentPath: [], waitUntil: null } });
}
