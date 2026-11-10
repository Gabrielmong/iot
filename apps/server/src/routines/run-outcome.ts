import type { RunStatus } from "../generated/prisma/client.js";

export type ProblemReason = "UNREACHABLE" | "NOT_READY" | "NO_ACCESS" | "REMOVED";
/** step: index of the Set step the problem happened in. */
export type Problem = { step: number; deviceId: string; deviceName: string; reason: ProblemReason };
/**
 * currentStep: index of the step in progress (null once ended); waitUntil: when the current Wait ends;
 * startedBy: the user's name, or null when the schedule started it.
 */
export type RunSnapshot = {
  status: RunStatus;
  startedAt: Date;
  endedAt: Date | null;
  problems: Problem[];
  currentStep: number | null;
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
