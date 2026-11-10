import { GraphQLError } from "graphql";
import { PubSub } from "graphql-subscriptions";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDriver } from "../src/devices/drivers/fake.js";
import { DeviceManager } from "../src/devices/manager.js";
import type { DeviceState } from "../src/devices/types.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { encryptSecret } from "../src/secrets.js";
import { closeDb, resetDb } from "./helpers.js";

const KEY = Buffer.alloc(32, 7);

let db: PrismaClient;
let driver: FakeDriver;
let manager: DeviceManager;
let stateEvents: { deviceId: string; state: DeviceState }[];
let changedEvents: number;
type LogFn = (...args: unknown[]) => void;
let log: { info: ReturnType<typeof vi.fn<LogFn>>; warn: ReturnType<typeof vi.fn<LogFn>>; error: ReturnType<typeof vi.fn<LogFn>> };

beforeEach(async () => {
  db = await resetDb();
  const pubsub = new PubSub();
  stateEvents = [];
  changedEvents = 0;
  await pubsub.subscribe("DEVICE_STATE", (p: { deviceId: string; state: DeviceState }) => stateEvents.push(p));
  await pubsub.subscribe("DEVICES_CHANGED", () => changedEvents++);
  driver = new FakeDriver("KASA");
  log = { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };
  manager = new DeviceManager(db, [driver], pubsub, KEY, { log });
});
afterEach(() => manager.stop());
afterAll(closeDb);

const plug = (over: Record<string, unknown> = {}) =>
  db.device.create({
    data: { brand: "KASA", kind: "PLUG", externalId: "dev1", name: "Plug", ip: "10.0.0.5", adopted: true, config: {}, ...over },
  });

describe("DeviceManager discovery", () => {
  it("creates a non-adopted device, with child devices, for an unknown discovery", async () => {
    await manager.start();
    driver.discover({
      brand: "KASA",
      externalId: "strip",
      ip: "10.0.0.9",
      model: "KP303",
      kind: "PLUG",
      children: [
        { externalId: "strip:00", name: "Outlet 1" },
        { externalId: "strip:01", name: "Outlet 2" },
      ],
    });
    await manager.idle();

    const parent = await db.device.findUniqueOrThrow({ where: { brand_externalId: { brand: "KASA", externalId: "strip" } } });
    expect(parent).toMatchObject({ adopted: false, ip: "10.0.0.9", model: "KP303", kind: "PLUG", parentId: null });
    expect(parent.lastSeenAt).toBeInstanceOf(Date);
    const children = await db.device.findMany({ where: { parentId: parent.id }, orderBy: { externalId: "asc" } });
    expect(children.map((c) => [c.externalId, c.name, c.adopted, c.ip])).toEqual([
      ["strip:00", "Outlet 1", false, "10.0.0.9"],
      ["strip:01", "Outlet 2", false, "10.0.0.9"],
    ]);
    expect(changedEvents).toBeGreaterThan(0);
  });

  it("updates ip and lastSeenAt of a known device and re-syncs its driver when the ip changed", async () => {
    const before = await plug({ lastSeenAt: new Date(0) });
    await manager.start();
    const syncs = driver.synced.length;

    driver.discover({ brand: "KASA", externalId: "dev1", ip: "10.0.0.77" });
    await manager.idle();

    const after = await db.device.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.ip).toBe("10.0.0.77");
    expect(after.lastSeenAt!.getTime()).toBeGreaterThan(0);
    expect(driver.synced.length).toBe(syncs + 1);
    expect(driver.synced.at(-1)!.map((d) => d.ip)).toEqual(["10.0.0.77"]);
  });

  it("does not re-sync when a known device reappears at the same ip", async () => {
    await plug();
    await manager.start();
    const syncs = driver.synced.length;

    driver.discover({ brand: "KASA", externalId: "dev1", ip: "10.0.0.5" });
    await manager.idle();

    expect(driver.synced.length).toBe(syncs);
  });

  it("sets the stream source only when it creates a device", async () => {
    const existing = await plug();
    await manager.start();

    driver.discover({ brand: "KASA", externalId: "cam", ip: "10.0.0.50", kind: "CAMERA", streamSource: "LOCAL" });
    driver.discover({ brand: "KASA", externalId: "dev1", ip: "10.0.0.5", streamSource: "LOCAL" });
    await manager.idle();

    const created = await db.device.findUniqueOrThrow({ where: { brand_externalId: { brand: "KASA", externalId: "cam" } } });
    expect(created.streamSource).toBe("LOCAL");
    expect((await db.device.findUniqueOrThrow({ where: { id: existing.id } })).streamSource).toBeNull();
  });
});

describe("DeviceManager sync and state", () => {
  it("syncs only adopted devices of the driver's brand, with decrypted secrets", async () => {
    await plug({ secret: encryptSecret("0123456789abcdef", KEY) });
    await plug({ externalId: "other", adopted: false });
    await db.device.create({ data: { brand: "TUYA", kind: "LIGHT", externalId: "t", name: "T", adopted: true, config: {} } });

    await manager.start();

    expect(driver.started).toBe(true);
    const synced = driver.synced.at(-1)!;
    expect(synced.map((d) => [d.externalId, d.secretPlain])).toEqual([["dev1", "0123456789abcdef"]]);
  });

  it("caches driver state and publishes DEVICE_STATE only when it changes", async () => {
    const d = await plug();
    await manager.start();
    expect(manager.getState(d.id)).toEqual({ online: false });

    driver.pushState(d.id, { online: true, on: true });
    driver.pushState(d.id, { online: true, on: true });

    expect(manager.getState(d.id)).toEqual({ online: true, on: true });
    expect(stateEvents).toEqual([{ deviceId: d.id, state: { online: true, on: true } }]);
  });

  it("persists a status reported by the driver and publishes DEVICES_CHANGED", async () => {
    const d = await plug();
    await manager.start();
    const changes = changedEvents;

    driver.reportStatus(d.id, "NEEDS_CREDENTIALS");
    driver.reportStatus(d.id, "NEEDS_CREDENTIALS");
    await manager.idle();

    expect((await db.device.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("NEEDS_CREDENTIALS");
    expect(changedEvents).toBe(changes + 1);
  });
});

describe("DeviceManager setState", () => {
  it("passes the record and patch to the driver", async () => {
    const d = await plug();
    await manager.start();

    await manager.setState(d.id, { on: true });

    expect(driver.commands).toEqual([{ deviceId: d.id, patch: { on: true } }]);
  });

  it("times out a hung driver: publishes online:false and throws DEVICE_UNREACHABLE within 3.5 s", async () => {
    const d = await plug();
    await manager.start();
    driver.pushState(d.id, { online: true, on: false });
    driver.setStateImpl = () => new Promise(() => {});

    const started = Date.now();
    const err = await manager.setState(d.id, { on: true }).catch((e: unknown) => e);
    const elapsed = Date.now() - started;

    expect(err).toBeInstanceOf(GraphQLError);
    expect((err as GraphQLError).extensions.code).toBe("DEVICE_UNREACHABLE");
    expect(elapsed).toBeLessThan(3500);
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(stateEvents.at(-1)).toEqual({ deviceId: d.id, state: { online: false, on: false } });
    expect(manager.getState(d.id).online).toBe(false);
  }, 10_000);

  it("maps a driver failure to DEVICE_UNREACHABLE, publishes online:false and logs the cause", async () => {
    const d = await plug();
    await manager.start();
    driver.setStateImpl = () => Promise.reject(new TypeError("socket hang up"));

    const err = await manager.setState(d.id, { on: true }).catch((e: unknown) => e);

    expect((err as GraphQLError).extensions.code).toBe("DEVICE_UNREACHABLE");
    expect(stateEvents.at(-1)).toEqual({ deviceId: d.id, state: { online: false } });
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${d.id}.*TypeError.*socket hang up`)));
  });

  it.each([
    ["a device that needs a key", { status: "NEEDS_KEY" }],
    ["a device that is not adopted", { adopted: false }],
    ["a camera", { kind: "CAMERA" }],
  ])("throws DEVICE_NOT_READY for %s", async (_, over) => {
    const d = await plug(over);
    await manager.start();

    const err = await manager.setState(d.id, { on: true }).catch((e: unknown) => e);

    expect((err as GraphQLError).extensions.code).toBe("DEVICE_NOT_READY");
    expect(driver.commands).toEqual([]);
  });
});

describe("DeviceManager removeDevice", () => {
  it("deletes the device, its children and their grants, then re-syncs", async () => {
    const parent = await plug({ externalId: "strip" });
    const child = await plug({ externalId: "strip:00", parentId: parent.id });
    const keep = await plug({ externalId: "keep" });
    const user = await db.user.create({ data: { name: "Ana", avatarColor: "#fff", role: "USER", pinHash: "h" } });
    await db.deviceGrant.createMany({
      data: [parent, child, keep].map((d) => ({ userId: user.id, deviceId: d.id })),
    });
    await manager.start();

    await manager.removeDevice(parent.id);

    expect((await db.device.findMany()).map((d) => d.id)).toEqual([keep.id]);
    expect((await db.deviceGrant.findMany()).map((g) => g.deviceId)).toEqual([keep.id]);
    expect(driver.synced.at(-1)!.map((d) => d.id)).toEqual([keep.id]);
    expect(changedEvents).toBeGreaterThan(0);
  });
});
