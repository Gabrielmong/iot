import { afterEach, describe, expect, it, vi } from "vitest";
import { WolDriver } from "../src/devices/drivers/wol.js";
import { record, recordingContext } from "./driver-helpers.js";

let driver: WolDriver | undefined;
afterEach(async () => {
  await driver?.stop();
  driver = undefined;
});

const pc = (over: Parameters<typeof record>[0] = {}) =>
  record({ brand: "WOL", kind: "COMPUTER", externalId: "aa:bb:cc:dd:ee:ff", config: { mac: "aa:bb:cc:dd:ee:ff" }, ...over });

describe("WolDriver", () => {
  it("wakes a computer by sending a magic packet to its MAC", async () => {
    const send = vi.fn(async () => {});
    driver = new WolDriver({ send, probe: async () => false });
    await driver.start(recordingContext());
    await driver.setState(pc(), { on: true });
    expect(send).toHaveBeenCalledWith("aa:bb:cc:dd:ee:ff");
  });

  it("reports a computer with an IP as awake or asleep from the probe", async () => {
    const ctx = recordingContext();
    let awake = true;
    driver = new WolDriver({ send: async () => {}, probe: async () => awake, pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc({ ip: "192.168.0.50" });
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: true }));
    awake = false;
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: false }));
  });

  it("never probes a computer without an IP and reports it ready to wake", async () => {
    const ctx = recordingContext();
    const probe = vi.fn(async () => true);
    driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc();
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true }));
    await new Promise((r) => setTimeout(r, 60));
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes ports 445, 3389 and 22", async () => {
    const probe = vi.fn(async () => true);
    driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 20 });
    await driver.start(recordingContext());
    await driver.sync([pc({ ip: "192.168.0.50" })]);
    await vi.waitFor(() => expect(probe).toHaveBeenCalledWith("192.168.0.50", [445, 3389, 22], 1000));
  });
});
