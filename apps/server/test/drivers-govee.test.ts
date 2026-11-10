import { EventEmitter } from "node:events";
import type { LightState } from "@home/protocols";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoveeDriver, type GoveeLanPort } from "../src/devices/drivers/govee.js";
import { GoveeLink } from "../src/devices/drivers/govee-link.js";
import { goveeCommands, goveeToDiscovered } from "../src/devices/drivers/govee-mapping.js";
import { record, recordingContext } from "./driver-helpers.js";

class StubLan extends EventEmitter implements GoveeLanPort {
  calls: unknown[][] = [];
  light: LightState = { on: true, brightness: 40, mode: "white", colorTempK: 4000 };
  start = async () => {};
  stop = async () => {};
  scan = (targets?: string[]) => void this.calls.push(["scan", targets]);
  status = async () => this.light;
  setOn = async (ip: string, on: boolean) => void this.calls.push(["setOn", ip, on]);
  setBrightness = async (ip: string, pct: number) => void this.calls.push(["setBrightness", ip, pct]);
  setColor = async (ip: string, rgb: unknown) => void this.calls.push(["setColor", ip, rgb]);
  setColorTemp = async (ip: string, k: number) => void this.calls.push(["setColorTemp", ip, k]);
}

let driver: GoveeDriver | undefined;
afterEach(async () => {
  await driver?.stop();
  driver = undefined;
});

describe("govee mapping", () => {
  it("maps a scan reply to a Discovered light keyed by the device id", () => {
    expect(goveeToDiscovered({ ip: "10.0.0.4", device: "AA:BB", sku: "H6008" })).toEqual({
      brand: "GOVEE",
      externalId: "AA:BB",
      ip: "10.0.0.4",
      model: "H6008",
      kind: "LIGHT",
    });
  });

  it("turns a patch into commands: on first, off last", () => {
    expect(goveeCommands({ on: true, brightness: 50, color: { r: 1, g: 2, b: 3 } })).toEqual([
      { type: "on", on: true },
      { type: "color", rgb: { r: 1, g: 2, b: 3 } },
      { type: "brightness", pct: 50 },
    ]);
    expect(goveeCommands({ on: false, colorTempK: 3000 })).toEqual([
      { type: "colorTemp", kelvin: 3000 },
      { type: "on", on: false },
    ]);
  });
});

describe("GoveeDriver", () => {
  it("reports scan replies and also scans known device IPs by unicast", async () => {
    const lan = new StubLan();
    const ctx = recordingContext();
    driver = new GoveeDriver({ lan });
    await driver.start(ctx);
    await driver.sync([record({ brand: "GOVEE", externalId: "AA", ip: "10.0.0.4" })]);

    lan.emit("device", { ip: "10.0.0.4", device: "AA", sku: "H6008" });
    expect(ctx.discoveredDevices).toEqual([goveeToDiscovered({ ip: "10.0.0.4", device: "AA", sku: "H6008" })]);
    expect(lan.calls).toContainEqual(["scan", ["10.0.0.4"]]);
  });

  it("polls status and sends commands to the device ip", async () => {
    const lan = new StubLan();
    const ctx = recordingContext();
    driver = new GoveeDriver({ lan });
    await driver.start(ctx);
    const d = record({ brand: "GOVEE", externalId: "AA", ip: "10.0.0.4" });
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, light: lan.light }));

    await driver.setState(d, { brightness: 70 });

    expect(lan.calls).toContainEqual(["setBrightness", "10.0.0.4", 70]);
    expect(ctx.lastState(d.id)).toEqual({ online: true, light: { ...lan.light, brightness: 70 } });
  });
});

describe("GoveeDriver lifecycle", () => {
  it("does not duplicate LAN listeners across stop/start", async () => {
    const lan = new StubLan();
    const ctx = recordingContext();
    driver = new GoveeDriver({ lan });
    await driver.start(ctx);
    await driver.stop();
    await driver.start(ctx);

    lan.emit("device", { ip: "10.0.0.4", device: "AA", sku: "H6008" });

    expect(ctx.discoveredDevices).toHaveLength(1);
  });

  it("does not report a status poll that finishes after the link stops", async () => {
    const lan = new StubLan();
    let resolve: ((s: LightState) => void) | undefined;
    lan.status = () => new Promise<LightState>((r) => (resolve = r));
    const ctx = recordingContext();
    const link = new GoveeLink("dev", "10.0.0.4", lan, ctx, 5000);

    link.start();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    link.stop();
    resolve!(lan.light);
    await new Promise((r) => setImmediate(r));

    expect(ctx.states).toEqual([]);
    expect(ctx.statuses).toEqual([]);
  });
});
