import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeKasaDevice, type FakeKasaChild } from "../../../packages/protocols/src/test/fake-kasa-device.js";
import type { KasaClient, KasaSysInfo } from "@home/protocols";
import { KasaDriver, type KasaDriverOptions } from "../src/devices/drivers/kasa.js";
import { KasaLink } from "../src/devices/drivers/kasa-link.js";
import { kasaStates, sysInfoToDiscovered } from "../src/devices/drivers/kasa-mapping.js";
import { DeviceNotReadyError } from "../src/devices/errors.js";
import { record, recordingContext } from "./driver-helpers.js";

const CREDS = { username: "me@example.com", password: "pw" };
const STRIP_INFO = {
  deviceId: "D1",
  model: "KP303(US)",
  alias: "Strip",
  children: [
    { id: "D100", alias: "Lamp", on: true },
    { id: "D101", alias: "Fan", on: false },
  ],
};

let fake: FakeKasaDevice | undefined;
let driver: KasaDriver | undefined;
afterEach(async () => {
  await driver?.stop();
  await fake?.close();
  driver = fake = undefined;
});

async function startDriver(opts: Partial<KasaDriverOptions>) {
  const ctx = recordingContext();
  driver = new KasaDriver({ credentials: async () => CREDS, discover: async () => [], ...opts });
  await driver.start(ctx);
  return ctx;
}

describe("kasa mapping", () => {
  it("maps sysinfo to a Discovered strip whose children's externalId is deviceId:childId", () => {
    expect(sysInfoToDiscovered(STRIP_INFO, "10.0.0.3")).toEqual({
      brand: "KASA",
      externalId: "D1",
      ip: "10.0.0.3",
      model: "KP303(US)",
      name: "Strip",
      kind: "PLUG",
      children: [
        { externalId: "D1:D100", name: "Lamp" },
        { externalId: "D1:D101", name: "Fan" },
      ],
    });
  });

  it("derives each record's state from sysinfo", () => {
    const parent = record({ brand: "KASA", externalId: "D1" });
    const fan = record({ brand: "KASA", externalId: "D1:D101" });
    expect(kasaStates(STRIP_INFO, [parent, fan])).toEqual([
      { deviceId: parent.id, state: { online: true, on: true } },
      { deviceId: fan.id, state: { online: true, on: false } },
    ]);
  });
});

describe("KasaDriver", () => {
  it("reports NEEDS_CREDENTIALS for adopted devices when no TP-Link credentials are stored", async () => {
    const ctx = await startDriver({ credentials: async () => undefined });
    const d = record({ brand: "KASA", kind: "PLUG", externalId: "D1", ip: "10.0.0.3" });

    await driver!.sync([d]);

    expect(ctx.statuses).toEqual([{ deviceId: d.id, status: "NEEDS_CREDENTIALS" }]);
    await expect(driver!.setState(d, { on: true })).rejects.toBeInstanceOf(DeviceNotReadyError);
  });

  it("identifies discovered IPs by sysinfo deviceId", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", model: "KP303(US)", alias: "Strip", children: [{ id: "D100", alias: "Lamp", state: 1 }] });
    const ctx = await startDriver({ port: fake.port, discover: async () => [{ ip: "127.0.0.1", deviceId: "hashed", model: "KP303" }] });

    await vi.waitFor(() => expect(ctx.discoveredDevices).toHaveLength(1));

    expect(ctx.discoveredDevices[0]).toMatchObject({ externalId: "D1", ip: "127.0.0.1", children: [{ externalId: "D1:D100", name: "Lamp" }] });
  });

  it("polls adopted devices and switches an outlet by child id", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", children: [{ id: "D100", alias: "Lamp", state: 0 }] });
    const ctx = await startDriver({ port: fake.port });
    const lamp = record({ brand: "KASA", kind: "PLUG", externalId: "D1:D100", ip: "127.0.0.1" });

    await driver!.sync([lamp]);
    await vi.waitFor(() => expect(ctx.lastState(lamp.id)).toEqual({ online: true, on: false }));
    expect(ctx.statuses).toContainEqual({ deviceId: lamp.id, status: "OK" });

    await driver!.setState(lamp, { on: true });

    expect(fake.children[0]!.state).toBe(1);
    await vi.waitFor(() => expect(ctx.lastState(lamp.id)).toEqual({ online: true, on: true }));
  });

  it("publishes the switched outlet's state as soon as the command succeeds", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", children: [{ id: "D100", alias: "Lamp", state: 0 }] });
    const ctx = await startDriver({ port: fake.port, pollIntervalMs: 60_000 });
    const lamp = record({ brand: "KASA", kind: "PLUG", externalId: "D1:D100", ip: "127.0.0.1" });
    await driver!.sync([lamp]);
    await vi.waitFor(() => expect(ctx.lastState(lamp.id)).toEqual({ online: true, on: false }));

    await driver!.setState(lamp, { on: true });

    expect(ctx.lastState(lamp.id)).toEqual({ online: true, on: true });
  });

  it("publishes every outlet's state when a whole strip is switched", async () => {
    const children: FakeKasaChild[] = [{ id: "D100", alias: "Lamp", state: 1 }, { id: "D101", alias: "Fan", state: 1 }];
    fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", children });
    const ctx = await startDriver({ port: fake.port, pollIntervalMs: 60_000 });
    const strip = record({ brand: "KASA", kind: "PLUG", externalId: "D1", ip: "127.0.0.1" });
    const fan = record({ brand: "KASA", kind: "PLUG", externalId: "D1:D101", ip: "127.0.0.1" });
    await driver!.sync([strip, fan]);
    await vi.waitFor(() => expect(ctx.lastState(fan.id)).toEqual({ online: true, on: true }));

    await driver!.setState(strip, { on: false });

    expect(ctx.lastState(strip.id)).toEqual({ online: true, on: false });
    expect(ctx.lastState(fan.id)).toEqual({ online: true, on: false });
  });

  it("reports NEEDS_CREDENTIALS when the device rejects the credentials", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", username: "other", password: "x", deviceId: "D1" });
    const ctx = await startDriver({ port: fake.port });
    const plug = record({ brand: "KASA", kind: "PLUG", externalId: "D1", ip: "127.0.0.1" });

    await driver!.sync([plug]);

    await vi.waitFor(() => expect(ctx.statuses).toContainEqual({ deviceId: plug.id, status: "NEEDS_CREDENTIALS" }));
    expect(ctx.lastState(plug.id)).toEqual({ online: false });
  });
});

describe("KasaDriver discovery with links", () => {
  it("does not re-identify an IP that already has a link", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", relayState: 1 });
    let calls = 0;
    const discover = async () => (calls++ === 0 ? [] : [{ ip: "127.0.0.1", deviceId: "x", model: "HS103" }]);
    const ctx = await startDriver({ port: fake.port, discover, discoveryIntervalMs: 20 });
    const plug = record({ brand: "KASA", kind: "PLUG", externalId: "D1", ip: "127.0.0.1" });

    await driver!.sync([plug]);
    await vi.waitFor(() => expect(ctx.lastState(plug.id)).toEqual({ online: true, on: true }));
    await vi.waitFor(() => expect(calls).toBeGreaterThan(4));

    expect(fake.handshakeCount).toBe(1);
  });
});

describe("KasaDriver.discoverNow", () => {
  const found = async () => [{ ip: "127.0.0.1", deviceId: "x", model: "HS103" }];

  it("counts discovered devices that reject the credentials", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", username: "other", password: "x", deviceId: "D1" });
    const ctx = await startDriver({ port: fake.port, discover: found, discoveryIntervalMs: 60_000 });

    expect(await driver!.discoverNow()).toEqual({ authFailures: 1 });
    expect(ctx.discoveredDevices).toEqual([]);
  });

  it("identifies every discovered IP, including linked ones, with the current credentials", async () => {
    fake = await FakeKasaDevice.start({ variant: "v2", ...CREDS, deviceId: "D1", relayState: 1 });
    const ctx = await startDriver({ port: fake.port, discover: found, discoveryIntervalMs: 60_000 });
    const plug = record({ brand: "KASA", kind: "PLUG", externalId: "D1", ip: "127.0.0.1" });
    await driver!.sync([plug]);
    ctx.discoveredDevices.length = 0;

    expect(await driver!.discoverNow()).toEqual({ authFailures: 0 });
    expect(ctx.discoveredDevices.filter((d) => d.externalId === "D1").length).toBeGreaterThan(0);
  });

  it("reports nothing without credentials", async () => {
    await startDriver({ credentials: async () => undefined, discover: found, discoveryIntervalMs: 60_000 });
    expect(await driver!.discoverNow()).toEqual({ authFailures: 0 });
  });
});

describe("KasaLink", () => {
  it("does not report a poll that finishes after stop()", async () => {
    let resolve: ((info: KasaSysInfo) => void) | undefined;
    const client = { getSysInfo: () => new Promise<KasaSysInfo>((r) => (resolve = r)) } as unknown as KasaClient;
    const ctx = recordingContext();
    const plug = record({ brand: "KASA", externalId: "D1" });
    const link = new KasaLink("10.0.0.3", [plug], client, ctx, 5000);

    link.start();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    link.stop();
    resolve!({ deviceId: "D1", model: "HS103", alias: "Plug", on: true });
    await new Promise((r) => setImmediate(r));

    expect(ctx.states).toEqual([]);
    expect(ctx.statuses).toEqual([]);
    expect(ctx.discoveredDevices).toEqual([]);
  });

  it("does not report a poll failure after stop()", async () => {
    let reject: ((err: Error) => void) | undefined;
    const client = { getSysInfo: () => new Promise<KasaSysInfo>((_, r) => (reject = r)) } as unknown as KasaClient;
    const ctx = recordingContext();
    const link = new KasaLink("10.0.0.3", [record({ brand: "KASA", externalId: "D1" })], client, ctx, 5000);

    link.start();
    await vi.waitFor(() => expect(reject).toBeDefined());
    link.stop();
    reject!(new Error("down"));
    await new Promise((r) => setImmediate(r));

    expect(ctx.states).toEqual([]);
  });
});
