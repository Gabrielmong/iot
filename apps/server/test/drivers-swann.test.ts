import { afterEach, describe, expect, it, vi } from "vitest";
import { RtspTimeoutError, type SwannProbeResult } from "@home/protocols";
import { SwannDriver, type SwannDriverOptions } from "../src/devices/drivers/swann.js";
import { parseSwannProbe, probeToDiscovered, swannCameraConfig } from "../src/devices/drivers/swann-mapping.js";
import { DeviceNotReadyError } from "../src/devices/errors.js";
import type { SwannSettings } from "../src/devices/swann-settings.js";
import { record, recordingContext } from "./driver-helpers.js";

const HOST = "10.0.0.50";
const CREDS = { username: "admin", password: "s3cret!" };
const PROBE: SwannProbeResult = {
  template: "swann-ch0N",
  channels: [1, 2, 3, 4].map((n) => ({ channel: n, mainPath: `/ch0${n}/0`, subPath: `/ch0${n}/1`, codec: "H264" as const })),
};
const SETTINGS: SwannSettings = { host: HOST, creds: CREDS, probe: PROBE };

type Describe = NonNullable<SwannDriverOptions["describe"]>;

let driver: SwannDriver | undefined;
afterEach(async () => {
  await driver?.stop();
  driver = undefined;
});

async function startDriver(opts: Partial<SwannDriverOptions> = {}) {
  const ctx = recordingContext();
  driver = new SwannDriver({ settings: async () => SETTINGS, describe: async () => ({ status: 200 }), ...opts });
  await driver.start(ctx);
  return ctx;
}

const camera = (channel: number, over: Record<string, unknown> = {}) =>
  record({
    brand: "SWANN",
    kind: "CAMERA",
    externalId: `${HOST}:ch${channel}`,
    ip: HOST,
    config: { channel, mainPath: `/ch0${channel}/0`, subPath: `/ch0${channel}/1`, codec: "H264", ...over },
  });

describe("swann mapping", () => {
  it("maps each probed channel to a LOCAL camera keyed by host and channel", () => {
    expect(probeToDiscovered(HOST, { template: "t", channels: [PROBE.channels[0]!, { channel: 2, mainPath: "/ch02/0", codec: "H265" }] })).toEqual([
      {
        brand: "SWANN",
        kind: "CAMERA",
        externalId: "10.0.0.50:ch1",
        ip: HOST,
        name: "Camera 1",
        streamSource: "LOCAL",
        config: { channel: 1, mainPath: "/ch01/0", subPath: "/ch01/1", codec: "H264" },
      },
      {
        brand: "SWANN",
        kind: "CAMERA",
        externalId: "10.0.0.50:ch2",
        ip: HOST,
        name: "Camera 2",
        streamSource: "LOCAL",
        config: { channel: 2, mainPath: "/ch02/0", codec: "H265" },
      },
    ]);
  });

  it("parses a stored probe and rejects malformed ones", () => {
    expect(parseSwannProbe(JSON.stringify(PROBE))).toEqual(PROBE);
    expect(parseSwannProbe("not json")).toBeUndefined();
    expect(parseSwannProbe(JSON.stringify({ template: "t", channels: [{ channel: 1, mainPath: "ch01", codec: "H264" }] }))).toBeUndefined();
    expect(parseSwannProbe(JSON.stringify({ template: "t", channels: [{ channel: 1, mainPath: "/ch01/0", codec: "VP9" }] }))).toBeUndefined();
  });

  it("reads a device's stream config", () => {
    expect(swannCameraConfig({ channel: 3, mainPath: "/ch03/0", codec: "H265" })).toEqual({ channel: 3, mainPath: "/ch03/0", codec: "H265" });
    expect(swannCameraConfig({})).toBeUndefined();
  });
});

describe("SwannDriver", () => {
  it("reports one discovered camera per probed channel", async () => {
    const ctx = await startDriver();

    await vi.waitFor(() => expect(ctx.discoveredDevices).toHaveLength(4));

    expect(ctx.discoveredDevices.map((d) => d.externalId)).toEqual(["10.0.0.50:ch1", "10.0.0.50:ch2", "10.0.0.50:ch3", "10.0.0.50:ch4"]);
    expect(ctx.discoveredDevices.every((d) => d.brand === "SWANN" && d.kind === "CAMERA" && d.streamSource === "LOCAL")).toBe(true);
  });

  it("stays idle when no probe is stored", async () => {
    const describe = vi.fn<Describe>(async () => ({ status: 200 }));
    const settings = vi.fn(async () => ({ host: HOST, creds: CREDS }) as SwannSettings);
    const ctx = await startDriver({ settings, describe });

    await vi.waitFor(() => expect(settings).toHaveBeenCalled());
    await driver!.sync([]);

    expect(ctx.discoveredDevices).toEqual([]);
    expect(describe).not.toHaveBeenCalled();
  });

  it("marks an adopted camera online when its sub stream answers DESCRIBE", async () => {
    const describe = vi.fn<Describe>(async () => ({ status: 200 }));
    const ctx = await startDriver({ describe });
    const cam = camera(2);

    await driver!.sync([cam]);

    await vi.waitFor(() => expect(ctx.lastState(cam.id)).toEqual({ online: true }));
    expect(describe).toHaveBeenCalledWith("rtsp://10.0.0.50:554/ch02/1", CREDS, expect.any(Number));
    expect(ctx.statuses).toContainEqual({ deviceId: cam.id, status: "OK" });
  });

  it("describes the main path when a camera has no sub stream", async () => {
    const describe = vi.fn<Describe>(async () => ({ status: 200 }));
    await startDriver({ describe });

    await driver!.sync([camera(1, { subPath: undefined })]);

    await vi.waitFor(() => expect(describe).toHaveBeenCalledWith("rtsp://10.0.0.50:554/ch01/0", CREDS, expect.any(Number)));
  });

  it("marks a camera offline when DESCRIBE fails", async () => {
    const ctx = await startDriver({ describe: async () => ({ status: 404 }) });
    const cam = camera(1);

    await driver!.sync([cam]);

    await vi.waitFor(() => expect(ctx.lastState(cam.id)).toEqual({ online: false }));
  });

  it("reports NEEDS_CREDENTIALS when the recorder rejects the login", async () => {
    const ctx = await startDriver({ describe: async () => ({ status: 401 }) });
    const cam = camera(1);

    await driver!.sync([cam]);

    await vi.waitFor(() => expect(ctx.statuses).toContainEqual({ deviceId: cam.id, status: "NEEDS_CREDENTIALS" }));
    expect(ctx.lastState(cam.id)).toEqual({ online: false });
  });

  it("takes every camera offline, without throwing, when the recorder is unreachable", async () => {
    const ctx = await startDriver({
      describe: async (url) => {
        throw new RtspTimeoutError(url, 3000);
      },
    });
    const cams = [camera(1), camera(2), camera(3), camera(4)];

    await expect(driver!.sync(cams)).resolves.toBeUndefined();

    await vi.waitFor(() => {
      for (const c of cams) expect(ctx.lastState(c.id)).toEqual({ online: false });
    });
  });

  it("does not throw when the settings cannot be read", async () => {
    const settings = vi.fn(async (): Promise<SwannSettings | undefined> => {
      throw new Error("database down");
    });
    const ctx = await startDriver({ settings });

    await expect(driver!.sync([camera(1)])).resolves.toBeUndefined();
    await vi.waitFor(() => expect(settings).toHaveBeenCalledTimes(2));
    expect(ctx.discoveredDevices).toEqual([]);
  });

  it("reports NEEDS_CREDENTIALS for adopted cameras when no recorder login is stored", async () => {
    const ctx = await startDriver({ settings: async () => undefined });
    const cam = camera(1);

    await driver!.sync([cam]);

    expect(ctx.statuses).toEqual([{ deviceId: cam.id, status: "NEEDS_CREDENTIALS" }]);
  });

  it("stops polling once stopped", async () => {
    const describe = vi.fn<Describe>(async () => ({ status: 200 }));
    await startDriver({ describe, pollIntervalMs: 10 });
    await driver!.sync([camera(1)]);
    await vi.waitFor(() => expect(describe).toHaveBeenCalled());

    await driver!.stop();
    const calls = describe.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));

    expect(describe.mock.calls.length).toBe(calls);
  });

  it("rejects commands: cameras have none", async () => {
    await startDriver();
    await expect(driver!.setState(camera(1), { on: true })).rejects.toBeInstanceOf(DeviceNotReadyError);
  });
});
