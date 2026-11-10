import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeTuyaDevice } from "../../../packages/protocols/src/test/fake-tuya-device.js";
import { tuyaKindFromCategory } from "../src/devices/drivers/tuya-kind.js";
import { TuyaDriver } from "../src/devices/drivers/tuya.js";
import { DeviceNotReadyError } from "../src/devices/errors.js";
import { recordingContext, record } from "./driver-helpers.js";

const LOCAL_KEY = "0123456789abcdef";
const LIGHT_DPS = { "20": true, "21": "white", "22": 1000, "23": 1000 };

let fake: FakeTuyaDevice | undefined;
let driver: TuyaDriver | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await driver?.stop();
  await fake?.close();
  driver = fake = undefined;
});

/** Drops client connections while the fake keeps listening (as a device reboot or Wi-Fi blip would). */
function dropConnections(device: FakeTuyaDevice): void {
  for (const socket of (device as unknown as { sockets: Set<import("node:net").Socket> }).sockets) socket.destroy();
}

async function startDriver(port = 1) {
  const ctx = recordingContext();
  driver = new TuyaDriver({ port, startDiscovery: async () => ({ stop: async () => {} }) });
  await driver.start(ctx);
  return ctx;
}

const light = (over: Record<string, unknown> = {}) =>
  record({ brand: "TUYA", kind: "LIGHT", externalId: "tuya1", ip: "127.0.0.1", config: { version: "3.3" }, secretPlain: LOCAL_KEY, ...over });

describe("tuyaKindFromCategory", () => {
  it.each([
    ["dj", "LIGHT"],
    ["dd", "LIGHT"],
    ["fwd", "LIGHT"],
    ["kg", "SWITCH"],
    ["tdq", "SWITCH"],
    ["cz", "PLUG"],
    ["pc", "PLUG"],
    ["sp", "CAMERA"],
    ["xyz", "UNKNOWN"],
  ])("maps %s to %s", (category, kind) => {
    expect(tuyaKindFromCategory(category)).toBe(kind);
  });
});

describe("TuyaDriver", () => {
  it("reports discovery broadcasts as Discovered devices", async () => {
    const ctx = recordingContext();
    driver = new TuyaDriver({
      startDiscovery: async (onDevice) => {
        onDevice({ ip: "10.0.0.8", gwId: "gw1", productKey: "pk", version: "3.4" });
        return { stop: async () => {} };
      },
    });
    await driver.start(ctx);

    expect(ctx.discoveredDevices).toEqual([{ brand: "TUYA", externalId: "gw1", ip: "10.0.0.8", config: { version: "3.4", productKey: "pk" } }]);
  });

  it.each([
    ["an empty local key", ""],
    ["no local key", undefined],
  ])("reports NEEDS_KEY for %s and does not connect", async (_, secretPlain) => {
    const ctx = await startDriver();
    const d = light({ secretPlain });

    await driver!.sync([d]);

    expect(ctx.statuses).toEqual([{ deviceId: d.id, status: "NEEDS_KEY" }]);
    await expect(driver!.setState(d, { on: true })).rejects.toBeInstanceOf(DeviceNotReadyError);
  });

  it("connects, publishes the light state and OK, and follows pushes", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: LIGHT_DPS });
    const ctx = await startDriver(fake.port);
    const d = light();

    await driver!.sync([d]);
    await vi.waitFor(() => expect(ctx.statuses).toContainEqual({ deviceId: d.id, status: "OK" }));

    expect(ctx.lastState(d.id)).toEqual({ online: true, light: { on: true, brightness: 100, mode: "white", colorTempK: 6500 } });

    fake.pushStatus({ "20": false });
    await vi.waitFor(() => expect(ctx.lastState(d.id)?.light?.on).toBe(false));
  });

  it("maps a patch to dps and sends it", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: LIGHT_DPS });
    const ctx = await startDriver(fake.port);
    const d = light();
    await driver!.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)?.online).toBe(true));

    await driver!.setState(d, { on: false });

    expect(fake.controls).toEqual([{ "20": false }]);
  });

  it("controls a switch through dp 1", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: { "1": false } });
    const ctx = await startDriver(fake.port);
    const d = light({ kind: "SWITCH" });
    await driver!.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: false }));

    await driver!.setState(d, { on: true });

    expect(fake.controls).toEqual([{ "1": true }]);
  });

  it("does not connect to cameras", async () => {
    const ctx = await startDriver();
    const d = light({ kind: "CAMERA" });

    await driver!.sync([d]);

    expect(ctx.statuses).toEqual([]);
    await expect(driver!.setState(d, { on: true })).rejects.toBeInstanceOf(DeviceNotReadyError);
  });

  it("publishes online:false when the connection drops", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: LIGHT_DPS });
    const ctx = await startDriver(fake.port);
    const d = light();
    await driver!.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)?.online).toBe(true));

    await fake.close();
    fake = undefined;

    await vi.waitFor(() => expect(ctx.lastState(d.id)?.online).toBe(false));
  });

  it("reconnects after 'disconnected' once the device is back", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: LIGHT_DPS });
    const ctx = recordingContext();
    driver = new TuyaDriver({ port: fake.port, startDiscovery: async () => ({ stop: async () => {} }), backoff: { initialMs: 20 } });
    await driver.start(ctx);
    const d = light();
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)?.online).toBe(true));

    dropConnections(fake);
    await vi.waitFor(() => expect(ctx.states.some((s) => s.state.online === false)).toBe(true));
    await vi.waitFor(() => expect(ctx.lastState(d.id)?.online).toBe(true));

    expect(fake.log.filter((l) => l === "recv query")).toHaveLength(2);
    await driver.setState(d, { on: false });
    expect(fake.controls).toEqual([{ "20": false }]);
  });

  it("reports KEY_INVALID for a wrong key and retries that device at most once per 60 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: "fedcba9876543210", dps: LIGHT_DPS });
    const ctx = await startDriver(fake.port);
    const d = light();
    const keyInvalid = () => ctx.statuses.filter((s) => s.status === "KEY_INVALID").length;
    const queries = () => fake!.log.filter((l) => l === "recv query").length;

    const first = ctx.waitForStatus();
    await driver!.sync([d]);
    await first;
    expect(keyInvalid()).toBe(1);
    expect(queries()).toBe(1);
    expect(ctx.lastState(d.id)?.online).toBe(false);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(queries()).toBe(1);

    const second = ctx.waitForStatus();
    await vi.advanceTimersByTimeAsync(1_000);
    await second;
    expect(keyInvalid()).toBe(2);
    expect(queries()).toBe(2);
  });
  it("publishes the sent dps as the new state once the command is acked", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: LIGHT_DPS, noStatusOnControl: true });
    const ctx = await startDriver(fake.port);
    const d = light();
    await driver!.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)?.online).toBe(true));

    await driver!.setState(d, { on: false });

    expect(ctx.lastState(d.id)).toEqual({ online: true, light: { on: false, brightness: 100, mode: "white", colorTempK: 6500 } });
  });

  it("drops and reconnects the link after a command timeout, so the device is reported online again", async () => {
    fake = await FakeTuyaDevice.start({ version: "3.3", id: "tuya1", localKey: LOCAL_KEY, dps: { "1": false } });
    const ctx = recordingContext();
    driver = new TuyaDriver({ port: fake.port, startDiscovery: async () => ({ stop: async () => {} }), backoff: { initialMs: 20 }, timeoutMs: 100 });
    await driver.start(ctx);
    const d = light({ kind: "SWITCH" });
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: false }));

    const before = ctx.states.length;
    fake.state.behaviour.silent = true;
    await expect(driver.setState(d, { on: true })).rejects.toThrow();
    fake.state.behaviour.silent = false;

    await vi.waitFor(() => expect(ctx.states.slice(before).map((s) => s.state.online)).toEqual([false, true]));
    expect(fake.log.filter((l) => l === "recv query")).toHaveLength(2);
  });
});
