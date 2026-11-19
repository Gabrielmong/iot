import type { RunStatus } from "../generated/prisma/client.js";

export type ProblemReason = "UNREACHABLE" | "NOT_READY" | "NO_ACCESS" | "REMOVED" | "ROUTINE_REMOVED" | "NESTED_TOO_DEEP" | "WEATHER_UNAVAILABLE";
/**
 * step: index of the top-level step the problem happened in. routineName: the (innermost) called routine it came from,
 * null at top level. Routine-level problems (a removed, unusable or too deeply nested routine) have no device.
 */
export type Problem = { step: number; deviceId: string | null; deviceName: string | null; reason: ProblemReason; routineName: string | null };
/**
 * Which way a condition step went. step: the top-level step; routineName: the called routine it was in (null at top level);
 * conditions: the conditions as text; ranRoutineName: the routine an If ran (null when it ran none, or it couldn't be loaded).
 */
export type RunNote = { step: number; routineName: string | null; kind: "IF_MET" | "IF_NOT_MET" | "STOPPED"; conditions: string; ranRoutineName: string | null };
/** One called routine the run is inside: its name, the step in progress there and how many steps it has. */
export type PathEntry = { routineName: string; step: number; stepCount: number };
/**
 * currentStep: index of the top-level step in progress (null once ended); currentPath: the called routines the run is inside,
 * innermost last (empty at top level); waitUntil: when the current (innermost) Wait ends;
 * startedBy: the user's name, or null when the schedule started it.
 */
export type RunSnapshot = {
  status: RunStatus;
  startedAt: Date;
  endedAt: Date | null;
  problems: Problem[];
  notes: RunNote[];
  currentStep: number | null;
  currentPath: PathEntry[];
  waitUntil: Date | null;
  startedBy: string | null;
};

/** OK with no problems, FAILED when every action had one, otherwise PARTIAL. */
export function outcome(actionCount: number, problems: Problem[]): "OK" | "PARTIAL" | "FAILED" {
  if (problems.length === 0) return "OK";
  return problems.length >= actionCount ? "FAILED" : "PARTIAL";
}

const REASON_BY_CODE: Record<string, ProblemReason> = { DEVICE_UNREACHABLE: "UNREACHABLE", DEVICE_NOT_READY: "NOT_READY", NOT_FOUND: "REMOVED" };

/** Maps a DeviceManager error to a problem reason; anything unexpected counts as unreachable. */
export function reasonFor(error: unknown): ProblemReason {
  const code = (error as { extensions?: { code?: unknown } })?.extensions?.code;
  return (typeof code === "string" && REASON_BY_CODE[code]) || "UNREACHABLE";
}
