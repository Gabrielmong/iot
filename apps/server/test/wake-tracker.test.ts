import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WakeTracker } from "../src/devices/computers/wake-tracker.js";

let changes: string[];
let tracker: WakeTracker;
const ID = "pc-1";
const confirmed = { hasIp: true, confirmable: true, alreadyOn: false };

beforeEach(() => {
  vi.useFakeTimers();
  changes = [];
  tracker = new WakeTracker({ now: () => Date.now(), onChange: (id) => void changes.push(id) });
});
afterEach(() => {
  tracker.stopAll();
  vi.useRealTimers();
});

describe("WakeTracker", () => {
  it("no IP is unconfirmed at once", () => {
    tracker.start(ID, { ...confirmed, hasIp: false });
    expect(tracker.get(ID)).toEqual({ status: "UNCONFIRMED", seconds: null });
  });

  it("already on wakes in 0 s", () => {
    tracker.start(ID, { ...confirmed, alreadyOn: true });
    expect(tracker.get(ID)).toEqual({ status: "WOKE", seconds: 0 });
  });

  it("sawOn reports whole seconds since the wake", async () => {
    tracker.start(ID, confirmed);
    expect(tracker.get(ID)).toEqual({ status: "WAKING", seconds: null });
    await vi.advanceTimersByTimeAsync(23_400);
    tracker.sawOn(ID);
    expect(tracker.get(ID)).toEqual({ status: "WOKE", seconds: 23 });
    expect(changes).toEqual([ID, ID]);
  });

  it("sawOn without a running wake does nothing", () => {
    tracker.sawOn(ID);
    expect(tracker.get(ID)).toBeNull();
    expect(changes).toEqual([]);
  });

  it("timeout fails a confirmable PC", async () => {
    tracker.start(ID, confirmed);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tracker.get(ID)).toEqual({ status: "FAILED", seconds: null });
  });

  it("timeout is unconfirmed for an unconfirmable PC", async () => {
    tracker.start(ID, { ...confirmed, confirmable: false });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tracker.get(ID)).toEqual({ status: "UNCONFIRMED", seconds: null });
  });

  it("restart replaces the running watch", async () => {
    tracker.start(ID, confirmed);
    await vi.advanceTimersByTimeAsync(100_000);
    tracker.start(ID, confirmed);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tracker.get(ID)?.status).toBe("WAKING");
  });

  it("results clear after 60 s", async () => {
    tracker.start(ID, { ...confirmed, alreadyOn: true });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(tracker.get(ID)?.status).toBe("WOKE");
    await vi.advanceTimersByTimeAsync(1);
    expect(tracker.get(ID)).toBeNull();
    expect(changes).toEqual([ID, ID]);
  });

  it("cancel stops without onChange", async () => {
    tracker.start(ID, confirmed);
    changes.length = 0;
    tracker.cancel(ID);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(tracker.get(ID)).toBeNull();
    expect(changes).toEqual([]);
  });
});
