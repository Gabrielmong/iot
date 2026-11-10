import type { StatePatch } from "../devices/types.js";
import type { Brand, DeviceKind } from "../generated/prisma/client.js";
import { fitAction } from "./action-rules.js";
import { outcome, reasonFor, type Problem, type RunSnapshot } from "./run-outcome.js";
import type { DeviceAction, RoutineStep } from "./steps.js";

export type { Problem, RunSnapshot } from "./run-outcome.js";

/** Who a run acts for: null = full access (shared routines, admins); otherwise grants are checked per Set step. */
export type RunAs = { userId: string } | null;

export type RunnerDeps = {
  setState(deviceId: string, patch: StatePatch): Promise<void>;
  device(id: string): Promise<{ id: string; name: string; kind: DeviceKind; brand: Brand } | null>;
  canAccess(userId: string, deviceId: string): Promise<boolean>;
  /** Rejects when `signal` aborts. */
  delay(ms: number, signal: AbortSignal): Promise<void>;
  now(): Date;
  /** Every status change of a live run. `key` is a routine id or "try:<userId>". */
  onChange(key: string, run: RunSnapshot): void;
};

type LiveRun = { abort: AbortController; snapshot: RunSnapshot };

const REMOVED_NAME = "Removed device";
const MINUTE_MS = 60_000;

/** Runs routines in memory: one live run per key, devices in a step switched concurrently. */
export class RoutineRunner {
  private readonly runs = new Map<string, LiveRun>();

  constructor(private readonly deps: RunnerDeps) {}

  /** Starts a run, replacing (silently) any live run with the same key. `startedBy`: a user's name, null for the schedule. */
  start(key: string, steps: RoutineStep[], runAs: RunAs, startedBy: string | null = null): void {
    this.runs.get(key)?.abort.abort();
    const snapshot: RunSnapshot = { status: "RUNNING", startedAt: this.deps.now(), endedAt: null, problems: [], currentStep: null, waitUntil: null, startedBy };
    const run: LiveRun = { abort: new AbortController(), snapshot };
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
    run.snapshot = { ...run.snapshot, status, endedAt: this.deps.now(), currentStep: null, waitUntil: null, problems: [...run.snapshot.problems] };
    this.deps.onChange(key, run.snapshot);
  }

  /** Reports that the run moved on to step `index` (a copy, so later changes don't leak into it). */
  private enterStep(key: string, run: LiveRun, index: number, waitUntil: Date | null): void {
    run.snapshot = { ...run.snapshot, currentStep: index, waitUntil, problems: [...run.snapshot.problems] };
    this.deps.onChange(key, run.snapshot);
  }

  private async execute(key: string, run: LiveRun, steps: RoutineStep[], runAs: RunAs): Promise<void> {
    let actionCount = 0;
    for (const [index, step] of steps.entries()) {
      if (!this.live(key, run)) return;
      const waitUntil = step.kind === "WAIT" ? new Date(this.deps.now().getTime() + step.minutes * MINUTE_MS) : null;
      this.enterStep(key, run, index, waitUntil);
      if (step.kind === "WAIT") {
        try {
          await this.deps.delay(step.minutes * MINUTE_MS, run.abort.signal);
        } catch {
          return; // stopped or replaced
        }
        continue;
      }
      actionCount += step.actions.length;
      const problems = await Promise.all(step.actions.map((a) => this.apply(a, runAs, index)));
      run.snapshot.problems.push(...problems.filter((p): p is Problem => p !== null));
    }
    if (this.live(key, run)) this.end(key, run, outcome(actionCount, run.snapshot.problems));
  }

  /** Sends one action; never throws. Returns the problem, if any. */
  private async apply(action: DeviceAction, runAs: RunAs, step: number): Promise<Problem | null> {
    const problem = (deviceName: string, reason: Problem["reason"]): Problem => ({ step, deviceId: action.deviceId, deviceName, reason });
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
