import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoveWatchdog, SAFETY_STOP_MS } from "../src/cameras/controls/watchdog.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("MoveWatchdog", () => {
  it("fires onExpire SAFETY_STOP_MS after the last touch", () => {
    const onExpire = vi.fn();
    const w = new MoveWatchdog({ timeoutMs: SAFETY_STOP_MS, onExpire });
    w.touch("cam");
    vi.advanceTimersByTime(SAFETY_STOP_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledExactlyOnceWith("cam");
  });

  it("touch resets the timer", () => {
    const onExpire = vi.fn();
    const w = new MoveWatchdog({ timeoutMs: 4000, onExpire });
    w.touch("cam");
    vi.advanceTimersByTime(3000);
    w.touch("cam");
    vi.advanceTimersByTime(3999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("clear cancels it", () => {
    const onExpire = vi.fn();
    const w = new MoveWatchdog({ timeoutMs: 4000, onExpire });
    w.touch("cam");
    w.clear("cam");
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("tracks cameras separately", () => {
    const onExpire = vi.fn();
    const w = new MoveWatchdog({ timeoutMs: 4000, onExpire });
    w.touch("a");
    vi.advanceTimersByTime(2000);
    w.touch("b");
    w.clear("a");
    vi.advanceTimersByTime(4000);
    expect(onExpire.mock.calls).toEqual([["b"]]);
  });

  it("dispose cancels everything", () => {
    const onExpire = vi.fn();
    const w = new MoveWatchdog({ timeoutMs: 4000, onExpire });
    w.touch("a");
    w.dispose();
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
