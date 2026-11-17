import type { StatePatch } from "../devices/types.js";
import type { Brand, DeviceKind } from "../generated/prisma/client.js";
import { fitAction } from "./action-rules.js";
import { enterRoutine, positionAt, routineNameOf, routineProblem } from "./called-routine.js";
import { outcome, reasonFor, type PathEntry, type Problem, type RunSnapshot } from "./run-outcome.js";
import { LIMITS, type DeviceAction, type RoutineStep } from "./steps.js";

export type { PathEntry, Problem, RunSnapshot } from "./run-outcome.js";

/** Who a run acts for: null = full access (shared routines, admins); otherwise grants are checked per Set step. */
export type RunAs = { userId: string } | null;

export type RunnerDeps = {
  setState(deviceId: string, patch: StatePatch): Promise<void>;
  device(id: string): Promise<{ id: string; name: string; kind: DeviceKind; brand: Brand } | null>;
  canAccess(userId: string, deviceId: string): Promise<boolean>;
  /** A routine a step runs, as `runAs` may use it; null when it was removed. A rejection is recorded as UNREACHABLE. */
  routine(id: string, runAs: RunAs): Promise<{ name: string; steps: RoutineStep[] } | "NO_ACCESS" | null>;
  /** Rejects when `signal` aborts. */
  delay(ms: number, signal: AbortSignal): Promise<void>;
  now(): Date;
  /** Every status change of a live run. `key` is a routine id or "try:<userId>". */
  onChange(key: string, run: RunSnapshot): void;
};

/** actionCount: device actions plus "run routine" steps that failed, for the run's outcome. */
type LiveRun = { abort: AbortController; snapshot: RunSnapshot; actionCount: number };
type StepsResult = "done" | "aborted";

const REMOVED_NAME = "Removed device";
const MINUTE_MS = 60_000;

/** Runs routines in memory: one live run per key, devices in a step switched concurrently. */
export class RoutineRunner {
  private readonly runs = new Map<string, LiveRun>();

  constructor(private readonly deps: RunnerDeps) {}

  /** Starts a run, replacing (silently) any live run with the same key. `startedBy`: a user's name, null for the schedule. */
  start(key: string, steps: RoutineStep[], runAs: RunAs, startedBy: string | null = null): void {
    this.runs.get(key)?.abort.abort();
    const snapshot: RunSnapshot = { status: "RUNNING", startedAt: this.deps.now(), endedAt: null, problems: [], currentStep: null, currentPath: [], waitUntil: null, startedBy };
    const run: LiveRun = { abort: new AbortController(), snapshot, actionCount: 0 };
    this.runs.set(key, run);
    void this.execute(key, run, steps, runAs);
  }

  /** Stops a live run and reports STOPPED; false if nothing was running. */
  stop(key: string): boolean {
    const run = this.runs.get(key);
    if (!run) return false;
    this.end(key, run, "STOPPED");
    run.abort.abort();
    return true;
  }

  isRunning(key: string): boolean {
    return this.runs.has(key);
  }

  /** Shutdown: aborts every run without reporting. */
  stopAll(): void {
    for (const run of this.runs.values()) run.abort.abort();
    this.runs.clear();
  }

  private live(key: string, run: LiveRun): boolean {
    return this.runs.get(key) === run;
  }

  private end(key: string, run: LiveRun, status: RunSnapshot["status"]): void {
    this.runs.delete(key);
    run.snapshot = { ...run.snapshot, status, endedAt: this.deps.now(), currentStep: null, currentPath: [], waitUntil: null, problems: [...run.snapshot.problems] };
    this.deps.onChange(key, run.snapshot);
  }

  /** Reports that the run moved on to step `index` of the routine at `path` (a copy, so later changes don't leak into it). */
  private enterStep(key: string, run: LiveRun, path: PathEntry[], index: number, waitUntil: Date | null): PathEntry[] {
    const position = positionAt(run.snapshot.currentStep, path, index);
    run.snapshot = { ...run.snapshot, ...position, waitUntil, problems: [...run.snapshot.problems] };
    this.deps.onChange(key, run.snapshot);
    return position.currentPath;
  }

  private async execute(key: string, run: LiveRun, steps: RoutineStep[], runAs: RunAs): Promise<void> {
    const result = await this.runSteps(key, run, steps, runAs, [], 1);
    if (result === "done" && this.live(key, run)) this.end(key, run, outcome(run.actionCount, run.snapshot.problems));
  }

  /** Runs the steps of the routine at `path` (top level when empty), `depth` routines deep. */
  private async runSteps(key: string, run: LiveRun, steps: RoutineStep[], runAs: RunAs, path: PathEntry[], depth: number): Promise<StepsResult> {
    for (const [index, step] of steps.entries()) {
      if (!this.live(key, run)) return "aborted";
      const waitUntil = step.kind === "WAIT" ? new Date(this.deps.now().getTime() + step.minutes * MINUTE_MS) : null;
      const here = this.enterStep(key, run, path, index, waitUntil);
      if (step.kind === "WAIT") {
        try {
          await this.deps.delay(step.minutes * MINUTE_MS, run.abort.signal);
        } catch {
          return "aborted"; // stopped or replaced
        }
      } else if (step.kind === "ROUTINE") {
        if ((await this.runRoutine(key, run, step.routineId, runAs, here, depth)) === "aborted") return "aborted";
      } else {
        run.actionCount += step.actions.length;
        const top = run.snapshot.currentStep ?? index;
        const problems = await Promise.all(step.actions.map((a) => this.apply(a, runAs, top, routineNameOf(here))));
        run.snapshot.problems.push(...problems.filter((p): p is Problem => p !== null));
      }
    }
    return "done";
  }

  /** A "run routine" step at `path`: runs the routine inline, or records why it couldn't. */
  private async runRoutine(key: string, run: LiveRun, id: string, runAs: RunAs, path: PathEntry[], depth: number): Promise<StepsResult> {
    const fail = (reason: Problem["reason"]): StepsResult => {
      run.actionCount += 1;
      run.snapshot.problems.push(routineProblem(run.snapshot.currentStep ?? 0, path, reason));
      return "done";
    };
    if (depth >= LIMITS.maxNesting) return fail("NESTED_TOO_DEEP");
    const called = await this.deps.routine(id, runAs).catch(() => "UNREACHABLE" as const);
    if (!this.live(key, run)) return "aborted";
    if (called === null) return fail("ROUTINE_REMOVED");
    if (called === "NO_ACCESS" || called === "UNREACHABLE") return fail(called);
    return this.runSteps(key, run, called.steps, runAs, enterRoutine(path, called.name, called.steps.length), depth + 1);
  }

  /** Sends one action; never throws. Returns the problem, if any. */
  private async apply(action: DeviceAction, runAs: RunAs, step: number, routineName: string | null): Promise<Problem | null> {
    const problem = (deviceName: string, reason: Problem["reason"]): Problem => ({ step, deviceId: action.deviceId, deviceName, reason, routineName });
    try {
      const device = await this.deps.device(action.deviceId);
      if (!device) return problem(REMOVED_NAME, "REMOVED");
      if (runAs && !(await this.deps.canAccess(runAs.userId, device.id))) return problem(device.name, "NO_ACCESS");
      const fitted = fitAction(action, device);
      if (!fitted) return problem(device.name, "NOT_READY");
      const { deviceId: _, ...patch } = fitted;
      try {
        await this.deps.setState(device.id, patch);
        return null;
      } catch (error) {
        const reason = reasonFor(error);
        return problem(reason === "REMOVED" ? REMOVED_NAME : device.name, reason);
      }
    } catch (error) {
      return problem(REMOVED_NAME, reasonFor(error));
    }
  }
}
