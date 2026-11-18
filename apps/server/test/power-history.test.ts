import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PowerHistory } from "../src/devices/computers/power-history.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { closeDb, resetDb } from "./helpers.js";

let db: PrismaClient;
let now: Date;
let deviceId: string;
const DAY = 24 * 60 * 60 * 1000;
const history = () => new PowerHistory(db, () => now);
const rows = () => db.powerEvent.findMany({ where: { deviceId }, orderBy: { at: "asc" } });

beforeEach(async () => {
  db = await resetDb();
  now = new Date("2026-11-17T08:00:00Z");
  const d = await db.device.create({ data: { brand: "WOL", kind: "COMPUTER", externalId: "aa:bb:cc:dd:ee:ff", name: "PC", adopted: true, config: {} } });
  deviceId = d.id;
});
afterAll(closeDb);

describe("PowerHistory", () => {
  it("stores only changes", async () => {
    const h = history();
    await h.record(deviceId, true);
    now = new Date(now.getTime() + 60_000);
    await h.record(deviceId, true);
    now = new Date(now.getTime() + 60_000);
    await h.record(deviceId, false);
    expect((await rows()).map((r) => r.on)).toEqual([true, false]);
  });

  it("dedupes against the stored row after a restart", async () => {
    await history().record(deviceId, true);
    await history().record(deviceId, true);
    expect(await rows()).toHaveLength(1);
  });

  it("prunes events older than 30 days", async () => {
    const h = history();
    await h.record(deviceId, true);
    now = new Date(now.getTime() + 31 * DAY);
    await h.record(deviceId, false);
    expect((await rows()).map((r) => r.on)).toEqual([false]);
  });

  it("since includes the state at the window start", async () => {
    const h = history();
    await h.record(deviceId, true);
    now = new Date("2026-11-17T12:00:00Z");
    await h.record(deviceId, false);
    const events = await h.since(deviceId, new Date("2026-11-17T10:00:00Z"));
    expect(events).toEqual([
      { on: true, at: new Date("2026-11-17T08:00:00Z") },
      { on: false, at: new Date("2026-11-17T12:00:00Z") },
    ]);
  });
});
