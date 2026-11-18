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
    driver = new WolDriver({ send, probe: async () => [] });
    await driver.start(recordingContext());
    await driver.setState(pc(), { on: true });
    expect(send).toHaveBeenCalledWith("aa:bb:cc:dd:ee:ff");
  });

  it("reports a computer with an IP as awake or asleep from the probe", async () => {
    const ctx = recordingContext();
    let awake = true;
    driver = new WolDriver({ send: async () => {}, probe: async () => (awake ? [445] : []), pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc({ ip: "192.168.0.50" });
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: true }));
    awake = false;
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: false }));
  });

  it("never probes a computer without an IP and reports it ready to wake", async () => {
    const ctx = recordingContext();
    const probe = vi.fn(async () => [445]);
    driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc();
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true }));
    await new Promise((r) => setTimeout(r, 60));
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes ports 445, 3389 and 22", async () => {
    const probe = vi.fn(async () => [445]);
    driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 20 });
    await driver.start(recordingContext());
    await driver.sync([pc({ ip: "192.168.0.50" })]);
    await vi.waitFor(() => expect(probe).toHaveBeenCalledWith("192.168.0.50", [445, 3389, 22], 1000));
  });

  it("an unconfirmed PC whose probe fails reports no on", async () => {
    const ctx = recordingContext();
    driver = new WolDriver({ send: async () => {}, probe: async () => [], pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc({ ip: "192.168.0.50" });
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true }));
    expect(ctx.discoveredDevices).toEqual([]);
  });

  it("the first answer marks the PC probeSeen, once", async () => {
    const ctx = recordingContext();
    const probe = vi.fn(async () => [445]);
    driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc({ ip: "192.168.0.50" });
    await driver.sync([d]);
    await vi.waitFor(() => expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(ctx.lastState(d.id)).toEqual({ online: true, on: true });
    expect(ctx.discoveredDevices).toEqual([{ brand: "WOL", externalId: "aa:bb:cc:dd:ee:ff", ip: "192.168.0.50", config: { probeSeen: true } }]);
  });

  it("RDP answering marks rdpSeen", async () => {
    const ctx = recordingContext();
    driver = new WolDriver({ send: async () => {}, probe: async () => [3389], pollIntervalMs: 20 });
    await driver.start(ctx);
    await driver.sync([pc({ ip: "192.168.0.50" })]);
    await vi.waitFor(() => expect(ctx.discoveredDevices.at(0)?.config).toEqual({ probeSeen: true, rdpSeen: true }));
  });

  it("a confirmed PC whose probe fails is off", async () => {
    const ctx = recordingContext();
    driver = new WolDriver({ send: async () => {}, probe: async () => [], pollIntervalMs: 20 });
    await driver.start(ctx);
    const d = pc({ ip: "192.168.0.50", config: { mac: "aa:bb:cc:dd:ee:ff", probeSeen: true } });
    await driver.sync([d]);
    await vi.waitFor(() => expect(ctx.lastState(d.id)).toEqual({ online: true, on: false }));
    expect(ctx.discoveredDevices).toEqual([]);
  });

  describe("after a wake", () => {
    afterEach(() => vi.useRealTimers());

    it("polls every 3 s until the PC answers", async () => {
      vi.useFakeTimers();
      let awake = false;
      const probe = vi.fn(async () => (awake ? [445] : []));
      driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 10_000 });
      await driver.start(recordingContext());
      const d = pc({ ip: "192.168.0.50" });
      await driver.sync([d]);
      await vi.advanceTimersByTimeAsync(0);
      expect(probe).toHaveBeenCalledTimes(1);
      await driver.setState(d, { on: true });
      await vi.advanceTimersByTimeAsync(3000);
      expect(probe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3000);
      expect(probe).toHaveBeenCalledTimes(3);
      awake = true;
      await vi.advanceTimersByTimeAsync(3000);
      expect(probe).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(3000);
      expect(probe).toHaveBeenCalledTimes(4); // back to the 10 s interval
    });

    it("stops fast polling after 2 minutes", async () => {
      vi.useFakeTimers();
      const probe = vi.fn(async () => [] as number[]);
      driver = new WolDriver({ send: async () => {}, probe, pollIntervalMs: 3_600_000 });
      await driver.start(recordingContext());
      const d = pc({ ip: "192.168.0.50" });
      await driver.sync([d]);
      await vi.advanceTimersByTimeAsync(0);
      await driver.setState(d, { on: true });
      await vi.advanceTimersByTimeAsync(120_000);
      const calls = probe.mock.calls.length;
      expect(calls).toBeGreaterThanOrEqual(40);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(probe.mock.calls.length).toBe(calls);
    });
  });
});
