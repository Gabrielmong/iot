import { badInput } from "../api-errors.js";
import type { PrismaClient, RoutineScope, User } from "../generated/prisma/client.js";
import { canSeeRoutine } from "./access.js";
import { HIDDEN_ROUTINE_NAME } from "./problem-view.js";
import { LIMITS, stepRoutineIds, type RoutineStep } from "./steps.js";

type CheckAs = Pick<User, "id" | "role">;
type Who = { scope: RoutineScope; ownerId: string | null; id?: string };

/** Routine id -> its name and the ids of the routines its steps run. */
export type CallGraph = Map<string, { name: string; calls: string[] }>;

export type CallProblem = { kind: "LOOP" | "TOO_DEEP"; names: string[] };

/**
 * The first loop, or the first chain of more than `maxNesting` routines, that runs through `savedId` (callers above it and callees below it).
 * Trouble elsewhere in the graph is not this save's concern. `names` is the offending chain.
 */
export function findCallProblem(graph: CallGraph, maxNesting: number, savedId: string): CallProblem | null {
  const nameOf = (id: string) => graph.get(id)?.name ?? id;
  const walk = (id: string, path: string[]): CallProblem | null => {
    const at = path.indexOf(id);
    if (at >= 0) {
      const loop = [...path.slice(at), id];
      return loop.includes(savedId) ? { kind: "LOOP", names: loop.map(nameOf) } : null;
    }
    if (path.length >= maxNesting) {
      const chain = [...path, id];
      return chain.includes(savedId) ? { kind: "TOO_DEEP", names: chain.map(nameOf) } : null;
    }
    for (const next of graph.get(id)?.calls ?? []) {
      if (!graph.has(next)) continue;
      const found = walk(next, [...path, id]);
      if (found) return found;
    }
    return null;
  };
  for (const id of graph.keys()) {
    const found = walk(id, []);
    if (found) return found;
  }
  return null;
}

type Row = { id: string; name: string; scope: RoutineScope; ownerId: string | null; steps: unknown; audience: { userId: string }[] };

const loadAll = (prisma: PrismaClient): Promise<Row[]> =>
  prisma.routine.findMany({ select: { id: true, name: true, scope: true, ownerId: true, steps: true, audience: true }, orderBy: { name: "asc" } });

/** A shared routine runs shared ones; a personal one runs its owner's personal ones and the shared ones `checkAs` can see. */
function callable(rows: Row[], checkAs: CheckAs, who: Who): Row[] {
  return rows.filter((r) => {
    if (r.id === who.id) return false;
    if (r.scope === "SHARED") return canSeeRoutine(checkAs, { scope: r.scope, ownerId: r.ownerId, audience: r.audience.map((a) => a.userId) });
    return who.scope === "PERSONAL" && r.ownerId === who.ownerId;
  });
}

/** The routines `who` may run, by name, never itself. */
export async function callableRoutines(prisma: PrismaClient, checkAs: CheckAs, who: Who): Promise<{ id: string; name: string }[]> {
  return callable(await loadAll(prisma), checkAs, who).map(({ id, name }) => ({ id, name }));
}

/** Save-time checks for "run routine" steps: targets exist and are usable, and the saved routine joins no loop or too-deep chain. */
export async function checkCalls(prisma: PrismaClient, steps: RoutineStep[], checkAs: CheckAs, who: Who & { name: string }): Promise<void> {
  const ids = stepRoutineIds(steps);
  if (ids.length === 0) return;
  const rows = await loadAll(prisma);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const allowed = new Set(callable(rows, checkAs, who).map((r) => r.id));
  for (const id of ids) {
    const target = byId.get(id);
    if (!target) throw badInput("Unknown routine");
    if (!allowed.has(id)) throw badInput(`You can't run ${target.name} from this routine`);
  }
  const saved = who.id ?? "new";
  const graph: CallGraph = new Map([[saved, { name: who.name, calls: ids }]]);
  for (const r of rows) {
    if (r.id === saved) continue;
    const visible = canSeeRoutine(checkAs, { scope: r.scope, ownerId: r.ownerId, audience: r.audience.map((a) => a.userId) });
    graph.set(r.id, { name: visible ? r.name : HIDDEN_ROUTINE_NAME, calls: stepRoutineIds(r.steps as RoutineStep[]) });
  }
  const problem = findCallProblem(graph, LIMITS.maxNesting, saved);
  if (!problem) return;
  const chain = problem.names.join(" → ");
  throw badInput(
    problem.kind === "LOOP" ? `A routine can't run itself (${chain})` : `Routines can run other routines only ${LIMITS.maxNesting} levels deep (${chain})`,
  );
}
