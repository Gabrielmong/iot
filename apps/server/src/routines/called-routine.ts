import type { PathEntry, Problem, RunSnapshot } from "./run-outcome.js";

/** The called routine a step at `path` belongs to; null at top level. */
export const routineNameOf = (path: PathEntry[]): string | null => path.at(-1)?.routineName ?? null;

/**
 * Where the run is once it enters step `index` of the routine at the end of `path` (the top level when `path` is empty):
 * top-level steps set `currentStep`; steps of a called routine keep it and move the innermost path entry. Always fresh copies.
 */
export function positionAt(currentStep: number | null, path: PathEntry[], index: number): Pick<RunSnapshot, "currentStep" | "currentPath"> {
  const last = path.at(-1);
  if (!last) return { currentStep: index, currentPath: [] };
  return { currentStep, currentPath: [...path.slice(0, -1).map((e) => ({ ...e })), { ...last, step: index }] };
}

/** The path inside a called routine, entered at its first step. */
export const enterRoutine = (path: PathEntry[], routineName: string, stepCount: number): PathEntry[] => [...path, { routineName, step: 0, stepCount }];

/** A problem with a "run routine" step itself (no device). */
export function routineProblem(step: number, path: PathEntry[], reason: Problem["reason"]): Problem {
  return { step, deviceId: null, deviceName: null, reason, routineName: routineNameOf(path) };
}
