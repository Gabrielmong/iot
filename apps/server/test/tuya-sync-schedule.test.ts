import { describe, expect, it, vi } from "vitest";
import { TuyaSyncSchedule } from "../src/services/tuya-sync-schedule.js";

/** Timers that only fire when the test says so. */
function manualTimers() {
  const pending: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms, cancelled: false };
      pending.push(t);
      return { cancel: () => (t.cancelled = true) };
    },
    /** Fires the next live timer and waits for the run it starts; returns its delay. */
    async fire(): Promise<number> {
      const t = pending.find((p) => !p.cancelled)!;
      pending.splice(pending.indexOf(t), 1);
      t.fn();
      await vi.waitFor(() => expect(pending.some((p) => !p.cancelled) || t.cancelled).toBe(true));
      return t.ms;
    },
    live: () => pending.filter((p) => !p.cancelled).length,
  };
}

const quietLog = () => ({ info: vi.fn(), warn: vi.fn() });

describe("TuyaSyncSchedule", () => {
  it("syncs after the first delay, then every interval", async () => {
    const timers = manualTimers();
    const sync = vi.fn(async () => ({ matched: 3, unmatched: [], found: [] }));
    const s = new TuyaSyncSchedule({ sync, configured: async () => true, log: quietLog(), setTimer: timers.setTimer, firstDelayMs: 120_000, intervalMs: 6 * 3600_000 });
    s.start();
    expect(await timers.fire()).toBe(120_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(await timers.fire()).toBe(6 * 3600_000);
    expect(sync).toHaveBeenCalledTimes(2);
    s.stop();
    expect(timers.live()).toBe(0);
  });

  it("skips the run while the Tuya cloud is not configured", async () => {
    const timers = manualTimers();
    const sync = vi.fn();
    const s = new TuyaSyncSchedule({ sync, configured: async () => false, log: quietLog(), setTimer: timers.setTimer, firstDelayMs: 1, intervalMs: 2 });
    s.start();
    await timers.fire();
    expect(sync).not.toHaveBeenCalled();
    expect(timers.live()).toBe(1);
    s.stop();
  });

  it("logs a failed run by message only and keeps the schedule going", async () => {
    const timers = manualTimers();
    const log = quietLog();
    const sync = vi.fn().mockRejectedValueOnce(new Error("Tuya cloud rejected the credentials")).mockResolvedValue({ matched: 1, unmatched: [], found: ["My lamp"] });
    const s = new TuyaSyncSchedule({ sync, configured: async () => true, log, setTimer: timers.setTimer, firstDelayMs: 1, intervalMs: 2 });
    s.start();
    await timers.fire();
    expect(log.warn).toHaveBeenCalledWith("tuya: scheduled sync failed: Tuya cloud rejected the credentials");
    await timers.fire();
    expect(log.info).toHaveBeenCalledWith("tuya: scheduled sync found devices that don't broadcast: My lamp");
    s.stop();
  });

  it("does nothing when the interval is 0 (turned off)", () => {
    const timers = manualTimers();
    const s = new TuyaSyncSchedule({ sync: vi.fn(), configured: async () => true, log: quietLog(), setTimer: timers.setTimer, firstDelayMs: 1, intervalMs: 0 });
    s.start();
    expect(timers.live()).toBe(0);
  });
});
