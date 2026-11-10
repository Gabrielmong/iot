import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { RoutineScheduler } from "../src/routines/scheduler.js";
import { closeDb, resetDb } from "./helpers.js";

afterAll(closeDb);

// Monday 9 Nov 2026, local time.
const at = (h: number, m: number, s = 0) => new Date(2026, 10, 9, h, m, s);

async function routineAt(db: PrismaClient, name: string, minuteOfDay: number, days: number[], enabled = true): Promise<string> {
  const r = await db.routine.create({ data: { name, scope: "SHARED", steps: [], schedules: { create: [{ minuteOfDay, days, enabled }] } } });
  return r.id;
}

function setup(db: PrismaClient, start: Date) {
  let now = start;
  const ran: string[] = [];
  const errors: unknown[] = [];
  const timers: number[] = [];
  let failFor: string | null = null;
  const scheduler = new RoutineScheduler({
    prisma: db,
    run: async (id) => {
      if (id === failFor) throw new Error("boom");
      ran.push(id);
    },
    now: () => now,
    log: { error: (...args: unknown[]) => void errors.push(args) },
    setTimer: (_fn, ms) => {
      timers.push(ms);
      return { cancel: () => {} };
    },
  });
  scheduler.start();
  return {
    scheduler,
    ran,
    errors,
    timers,
    moveTo: (d: Date) => void (now = d),
    failFor: (id: string) => void (failFor = id),
  };
}

describe("RoutineScheduler", () => {
  it("arms its timer for just after the next minute", async () => {
    const t = setup(await resetDb(), at(7, 0, 30));
    expect(t.timers).toEqual([30_050]);
    t.scheduler.stop();
  });

  it("fires a routine whose schedule matches the minute and weekday", async () => {
    const db = await resetDb();
    const id = await routineAt(db, "Morning", 7 * 60 + 1, [1, 2, 3, 4, 5]);
    const t = setup(db, at(7, 0, 59));
    t.moveTo(at(7, 1, 0));
    await t.scheduler.tick();
    expect(t.ran).toEqual([id]);
  });

  it("fires each minute between ticks once", async () => {
    const db = await resetDb();
    const id = await routineAt(db, "Morning", 7 * 60 + 1, [1]);
    const t = setup(db, at(7, 0, 59));
    t.moveTo(at(7, 2, 1));
    await t.scheduler.tick();
    t.moveTo(at(7, 2, 40));
    await t.scheduler.tick();
    expect(t.ran).toEqual([id]);
  });

  it("does not catch up on minutes before it started", async () => {
    const db = await resetDb();
    await routineAt(db, "Earlier", 7 * 60, [1]);
    const t = setup(db, at(7, 0, 30));
    t.moveTo(at(7, 1, 0));
    await t.scheduler.tick();
    expect(t.ran).toEqual([]);
  });

  it("ignores disabled rows and other weekdays", async () => {
    const db = await resetDb();
    await routineAt(db, "Off", 7 * 60 + 1, [1], false);
    await routineAt(db, "Weekend", 7 * 60 + 1, [6, 7]);
    const t = setup(db, at(7, 0, 59));
    t.moveTo(at(7, 1, 0));
    await t.scheduler.tick();
    expect(t.ran).toEqual([]);
  });

  it("a failing run is logged and doesn't stop later routines", async () => {
    const db = await resetDb();
    const bad = await routineAt(db, "A", 7 * 60 + 1, [1]);
    const good = await routineAt(db, "B", 7 * 60 + 1, [1]);
    const t = setup(db, at(7, 0, 59));
    t.failFor(bad);
    t.moveTo(at(7, 1, 0));
    await t.scheduler.tick();
    expect(t.ran).toEqual([good]);
    expect(t.errors).toHaveLength(1);
  });
});
