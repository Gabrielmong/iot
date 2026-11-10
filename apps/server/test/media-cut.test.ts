import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamInfo } from "../src/cameras/go2rtc/api.js";
import { MediaCutter } from "../src/cameras/streams/media-cut.js";

const WINDOW = 150;

/** go2rtc's view of the streams: consumer formats per stream name; a missing name is no stream. */
function setup(initial: Record<string, string[]> = {}) {
  const consumers = new Map(Object.entries(initial));
  const log = { info: vi.fn(), warn: vi.fn() };
  const streamInfo = vi.fn(async (name: string): Promise<StreamInfo | null> => {
    const formats = consumers.get(name);
    return formats ? { producers: [], consumers: formats.map((formatName) => ({ formatName })) } : null;
  });
  // A restart ends every media session.
  const restart = vi.fn(() => {
    for (const name of consumers.keys()) consumers.set(name, []);
  });
  // The registry's names: per device, the live and sub stream (here simply derived from the id).
  const namesOf = (deviceId: string) => [`cam-${deviceId}`, `cam-${deviceId}-sub`];
  const cutter = new MediaCutter({ streamInfo, namesOf, restart, log, windowMs: WINDOW });
  cutters.push(cutter);
  return { cutter, consumers, streamInfo, restart, log };
}

const cutters: MediaCutter[] = [];
afterEach(() => {
  for (const c of cutters.splice(0)) c.dispose();
});

describe("MediaCutter", () => {
  it("asks go2rtc only about the names the registry gave the camera", async () => {
    const { cutter, restart, streamInfo } = setup({ "cam-a": ["webrtc"] });
    await cutter.cut(["a"]);
    expect(streamInfo.mock.calls.map((c) => c[0]).sort()).toEqual(["cam-a", "cam-a-sub"]);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("restarts go2rtc when a revoked camera has a WebRTC consumer", async () => {
    const { cutter, restart, streamInfo } = setup({ "cam-a": ["webrtc"], "cam-a-sub": [] });
    await cutter.cut(["a"]);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(streamInfo.mock.calls.map((c) => c[0]).sort()).toEqual(["cam-a", "cam-a-sub"]);
  });

  it("restarts for a consumer on the sub stream, or one whose format is unknown", async () => {
    const sub = setup({ "cam-a": [], "cam-a-sub": ["webrtc"] });
    await sub.cutter.cut(["a"]);
    expect(sub.restart).toHaveBeenCalledTimes(1);

    const unnamed = setup({ "cam-a": [""] });
    await unnamed.cutter.cut(["a"]);
    expect(unnamed.restart).toHaveBeenCalledTimes(1);
  });

  it("does not restart when nothing plays, or only our own MSE proxies and frame grabs consume", async () => {
    const { cutter, restart } = setup({ "cam-a": ["mse/fmp4", "keyframe"], "cam-b": [] });
    await cutter.cut(["a", "b", "never-registered"]);
    expect(restart).not.toHaveBeenCalled();
  });

  it("restarts when it cannot tell (stream info fails)", async () => {
    const { cutter, restart, streamInfo, log } = setup({ "cam-a": [] });
    streamInfo.mockRejectedValueOnce(new Error("go2rtc GET /api/streams: ECONNRESET"));
    await cutter.cut(["a"]);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalled();
  });

  it("coalesces events arriving together into one restart", async () => {
    const { cutter, restart } = setup({ "cam-a": ["webrtc"], "cam-b": ["webrtc"] });
    await Promise.all([cutter.cut(["a"]), cutter.cut(["b"]), cutter.cut(["a", "b"])]);
    await new Promise((r) => setTimeout(r, WINDOW * 2));
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("restarts again after the window when a consumer is still there", async () => {
    const { cutter, restart, consumers } = setup({ "cam-a": ["webrtc"] });
    await cutter.cut(["a"]);
    consumers.set("cam-a", ["webrtc"]); // someone new connected right after
    await cutter.cut(["a"]);
    expect(restart).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(2), { timeout: WINDOW * 4 });
  });

  it("restarts unconditionally when forced (a removed camera), still at most once per window", async () => {
    const { cutter, restart } = setup();
    cutter.restartSoon([], true);
    cutter.restartSoon([], true);
    expect(restart).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(2), { timeout: WINDOW * 4 });
  });
});
