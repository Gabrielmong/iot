import type { PrismaClient } from "../generated/prisma/client.js";
import { canSeeRoutine } from "./access.js";
import type { RunAs } from "./runner.js";
import type { RoutineStep } from "./steps.js";

/** A routine a "run routine" step runs: null when removed, NO_ACCESS when `runAs` can't see it (full-access runs see all). */
export async function loadCalledRoutine(prisma: PrismaClient, id: string, runAs: RunAs): Promise<{ name: string; steps: RoutineStep[] } | "NO_ACCESS" | null> {
  const row = await prisma.routine.findUnique({ where: { id }, include: { audience: true } });
  if (!row) return null;
  if (runAs) {
    const user = await prisma.user.findUnique({ where: { id: runAs.userId }, select: { id: true, role: true } });
    const facts = { scope: row.scope, ownerId: row.ownerId, audience: row.audience.map((a) => a.userId) };
    if (!user || !canSeeRoutine(user, facts)) return "NO_ACCESS";
  }
  return { name: row.name, steps: row.steps as RoutineStep[] };
}
