import type { PrismaClient } from "../generated/prisma/client.js";
import { isDue, slotsBetween } from "./schedule.js";

type Timer = { cancel(): void };

export type SchedulerDeps = {
  prisma: PrismaClient;
  run: (routineId: string) => Promise<void>;
  now: () => Date;
  log: Pick<Console, "error">;
  setTimer?: (fn: () => void, ms: number) => Timer;
};

const MINUTE_MS = 60_000;
/** Fire just after the boundary so the new minute has begun on every clock reading. */
const BOUNDARY_SLACK_MS = 50;

const realTimer = (fn: () => void, ms: number): Timer => {
  const t = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(t) };
};

/**
 * Starts routines at their scheduled local times. Each tick covers every minute since the previous
 * one (so a late tick misses nothing), and minutes before start() are never caught up.
 */
export class RoutineScheduler {
  private last: Date | null = null;
  private timer: Timer | null = null;
  private readonly setTimer: (fn: () => void, ms: number) => Timer;

  constructor(private readonly deps: SchedulerDeps) {
    this.setTimer = deps.setTimer ?? realTimer;
  }

  start(): void {
    this.last = this.deps.now();
    this.arm();
  }

  stop(): void {
    this.timer?.cancel();
    this.timer = null;
    this.last = null;
  }

  async tick(): Promise<void> {
    if (!this.last) return;
    const now = this.deps.now();
    const slots = slotsBetween(this.last, now);
    this.last = now;
    try {
      if (slots.length > 0) await this.runDue(slots);
    } catch (error) {
      this.deps.log.error("routine schedule check failed", error);
    }
    if (this.timer) this.arm();
  }

  private arm(): void {
    const ms = MINUTE_MS - (this.deps.now().getTime() % MINUTE_MS) + BOUNDARY_SLACK_MS;
    this.timer = this.setTimer(() => void this.tick(), ms);
  }

  private async runDue(slots: ReturnType<typeof slotsBetween>): Promise<void> {
    const days = [...new Set(slots.map((s) => s.day))];
    const rows = await this.deps.prisma.routineSchedule.findMany({ where: { enabled: true, days: { hasSome: days } } });
    for (const slot of slots) {
      const due = new Set(rows.filter((r) => isDue(r, slot)).map((r) => r.routineId));
      for (const routineId of due) {
        try {
          await this.deps.run(routineId);
        } catch (error) {
          this.deps.log.error(`scheduled routine ${routineId} failed to start`, error);
        }
      }
    }
  }
}
