import { afterEach, describe, expect, it, vi } from "vitest";
import { onShutdownSignal } from "../src/shutdown.js";

const log = { info: () => {}, error: () => {} };

afterEach(() => {
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  vi.restoreAllMocks();
});

describe("onShutdownSignal", () => {
  it("stops once on SIGTERM/SIGINT, then exits 0", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const stop = vi.fn(async () => {});
    onShutdownSignal(stop, log);
    process.emit("SIGTERM");
    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("exits 1 when stopping takes longer than the timeout", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const error = vi.fn();
    onShutdownSignal(() => new Promise(() => {}), { ...log, error }, 30);
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("did not finish"));
  });

  it("exits 1 when stopping fails", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    onShutdownSignal(() => Promise.reject(new Error("db gone")), log);
    process.emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });
});
