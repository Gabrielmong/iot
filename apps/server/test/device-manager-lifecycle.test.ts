import { PubSub } from "graphql-subscriptions";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDriver } from "../src/devices/drivers/fake.js";
import { DeviceManager } from "../src/devices/manager.js";
import type { DeviceState } from "../src/devices/types.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { closeDb, resetDb } from "./helpers.js";

const KEY = Buffer.alloc(32, 7);

let db: PrismaClient;
let pubsub: PubSub;
let manager: DeviceManager | undefined;
let stateEvents: { deviceId: string; state: DeviceState }[];
type LogFn = (...args: unknown[]) => void;
const log = { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };

beforeEach(async () => {
  vi.clearAllMocks();
  db = await resetDb();
  pubsub = new PubSub();
  stateEvents = [];
  await pubsub.subscribe("DEVICE_STATE", (p: { deviceId: string; state: DeviceState }) => stateEvents.push(p));
});
afterEach(async () => {
  await manager?.stop();
  manager = undefined;
});
afterAll(closeDb);

const device = (over: Record<string, unknown> = {}) =>
  db.device.create({
    data: { brand: "KASA", kind: "PLUG", externalId: "dev1", name: "Plug", ip: "10.0.0.5", adopted: true, config: {}, ...over },
  });

describe("DeviceManager after removal", () => {
  it("ignores state and status that arrive for a removed device", async () => {
    const driver = new FakeDriver("KASA");
    manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
    const d = await device();
    await manager.start();

    await manager.removeDevice(d.id);
    driver.pushState(d.id, { online: true, on: true });
    driver.reportStatus(d.id, "NEEDS_CREDENTIALS");
    await manager.idle();

    expect(manager.getState(d.id)).toEqual({ online: false });
    expect(stateEvents).toEqual([]);
  });

  it("ignores state for devices that are not adopted", async () => {
    const driver = new FakeDriver("KASA");
    manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
    const d = await device({ adopted: false });
    await manager.start();

    driver.pushState(d.id, { online: true, on: true });

    expect(stateEvents).toEqual([]);
  });

  it("does not let an ip-change sync in flight resurrect a removed device", async () => {
    const driver = new FakeDriver("KASA");
    manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
    const d = await device();
    await manager.start();
    let release: (() => void) | undefined;
    driver.syncImpl = () => new Promise<void>((resolve) => (release = resolve));

    driver.discover({ brand: "KASA", externalId: "dev1", ip: "10.0.0.99" });
    await vi.waitFor(() => expect(release).toBeDefined());
    driver.syncImpl = undefined;
    const removal = manager.removeDevice(d.id);
    await vi.waitFor(async () => expect(await db.device.count()).toBe(0));
    await new Promise((r) => setTimeout(r, 200));
    release!();
    await removal;
    await manager.idle();

    expect(driver.synced.at(-1)).toEqual([]);
  });
});

describe("DeviceManager with a failing driver", () => {
  it("keeps starting and syncing the other drivers", async () => {
    const broken = new FakeDriver("KASA");
    broken.startImpl = () => Promise.reject(new Error("kasa start failed"));
    broken.syncImpl = () => Promise.reject(new Error("kasa sync failed"));
    const tuya = new FakeDriver("TUYA");
    const govee = new FakeDriver("GOVEE");
    manager = new DeviceManager(db, [broken, tuya, govee], pubsub, KEY, { log });
    await device({ brand: "TUYA", externalId: "t1" });
    await device({ brand: "GOVEE", externalId: "g1" });

    await manager.start();

    expect(tuya.synced.at(-1)!.map((d) => d.externalId)).toEqual(["t1"]);
    expect(govee.synced.at(-1)!.map((d) => d.externalId)).toEqual(["g1"]);
    expect(log.error).toHaveBeenCalled();

    await manager.refresh();
    expect(tuya.synced).toHaveLength(2);
  });
});

describe("DeviceManager discovery of adopted devices", () => {
  it("never changes an adopted device's config from a sighting (no protocol downgrade)", async () => {
    const driver = new FakeDriver("TUYA");
    manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
    const d = await device({ brand: "TUYA", externalId: "gw", config: { version: "3.4" } });
    await manager.start();

    driver.discover({ brand: "TUYA", externalId: "gw", ip: "10.0.0.5", config: { version: "3.1", productKey: "pk" } });
    await manager.idle();

    const after = await db.device.findUniqueOrThrow({ where: { id: d.id } });
    expect(after.config).toEqual({ version: "3.4", productKey: "pk" });
  });

  it("updates a non-adopted device's config from sightings", async () => {
    const driver = new FakeDriver("TUYA");
    manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
    const d = await device({ brand: "TUYA", externalId: "gw", adopted: false, config: { version: "3.3" } });
    await manager.start();

    driver.discover({ brand: "TUYA", externalId: "gw", ip: "10.0.0.5", config: { version: "3.4" } });
    await manager.idle();

    expect((await db.device.findUniqueOrThrow({ where: { id: d.id } })).config).toEqual({ version: "3.4" });
  });

  it("records a removed device again on its next sighting", async () => {
    const driver = new FakeDriver("TUYA");
    manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
    await manager.start();
    const sighting = { brand: "TUYA" as const, externalId: "gw", ip: "10.0.0.5" };
    driver.discover(sighting);
    await manager.idle();
    const created = await db.device.findFirstOrThrow();

    await manager.removeDevice(created.id);
    driver.discover(sighting);
    await manager.idle();

    expect(await db.device.count()).toBe(1);
  });
});
