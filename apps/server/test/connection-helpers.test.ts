import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Backoff } from "../src/devices/drivers/backoff.js";
import { LinkRegistry } from "../src/devices/drivers/link-registry.js";
import { Poller } from "../src/devices/drivers/poller.js";
import { Reconnector } from "../src/devices/drivers/reconnector.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Backoff", () => {
  it("doubles transient delays up to 60 s and uses 60 s after auth failures", () => {
    const b = new Backoff({ initialMs: 1000 });
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(() => b.next("transient"))).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(b.next("auth")).toBe(60_000);
    b.reset();
    expect(b.next("transient")).toBe(1000);
  });
});

describe("Reconnector", () => {
  it("runs the attempt after the backoff delay and can be cancelled", async () => {
    const attempt = vi.fn();
    const r = new Reconnector(attempt, { initialMs: 1000 });

    r.failed("transient");
    await vi.advanceTimersByTimeAsync(999);
    expect(attempt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(1);

    r.failed("transient");
    await vi.advanceTimersByTimeAsync(1999);
    r.cancel();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("waits 60 s after an auth failure", async () => {
    const attempt = vi.fn();
    const r = new Reconnector(attempt, { initialMs: 1000 });
    r.failed("auth");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(attempt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("soon() restarts the backoff and pulls a waiting attempt forward", async () => {
    const attempt = vi.fn();
    const r = new Reconnector(attempt, { initialMs: 1000 });
    r.failed("transient");
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.failed("transient")).toBe(2000);
    r.soon(500);
    await vi.advanceTimersByTimeAsync(500);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(r.failed("transient")).toBe(1000);
    r.soon(5000); // never pushes an attempt back
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("soon() schedules nothing when no attempt is waiting", async () => {
    const attempt = vi.fn();
    const r = new Reconnector(attempt, { initialMs: 1000 });
    r.soon(500);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("Reconnector stability", () => {
  it("resets the backoff only after the connection stayed up for 30 s", async () => {
    const r = new Reconnector(() => {}, { initialMs: 1000 });
    expect(r.failed("transient")).toBe(1000);
    r.connected();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(r.failed("transient")).toBe(2000);
    r.connected();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(r.failed("transient")).toBe(1000);
    r.cancel();
  });
});

describe("Poller", () => {
  it("polls every interval, backs off on failure (capped at 60 s), and resets on success", async () => {
    let fail = false;
    const poll = vi.fn(async () => {
      if (fail) throw new Error("down");
    });
    const p = new Poller(poll, () => "transient", { intervalMs: 5000 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(poll).toHaveBeenCalledTimes(2);

    fail = true;
    await vi.advanceTimersByTimeAsync(5000); // fails; next in 5 s
    await vi.advanceTimersByTimeAsync(5000); // fails; next in 10 s
    expect(poll).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(9999);
    expect(poll).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(5);

    p.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(poll).toHaveBeenCalledTimes(5);
  });

  it("waits 60 s after an auth failure", async () => {
    const poll = vi.fn(async () => {
      throw new Error("auth");
    });
    const p = new Poller(poll, () => "auth", { intervalMs: 5000 });
    p.start();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    p.stop();
  });
});

describe("LinkRegistry", () => {
  it("keeps unchanged links, replaces changed ones and stops removed ones", () => {
    const made: { key: string; stopped: boolean; stop(): void }[] = [];
    const create = (item: { key: string; v: number }) => {
      const link = { key: item.key, stopped: false, stop: () => void (link.stopped = true) };
      made.push(link);
      return link;
    };
    const reg = new LinkRegistry<(typeof made)[number]>();
    const sync = (items: { key: string; v: number }[]) => reg.sync(items, (i) => i.key, (i) => String(i.v), create);

    sync([{ key: "a", v: 1 }, { key: "b", v: 1 }]);
    sync([{ key: "a", v: 1 }, { key: "b", v: 2 }]);
    sync([{ key: "b", v: 2 }]);

    expect(made.map((l) => [l.key, l.stopped])).toEqual([
      ["a", true],
      ["b", true],
      ["b", false],
    ]);
    expect(reg.get("b")).toBe(made[2]);
    reg.stopAll();
    expect(made[2]!.stopped).toBe(true);
  });
});
