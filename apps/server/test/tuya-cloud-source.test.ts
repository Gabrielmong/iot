import { TuyaCloudAuthError, TuyaCloudError, TuyaCloudStreamUnavailableError, type CloudStream, type CloudStreamType } from "@home/protocols";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";
import { TuyaCloudSource } from "../src/cameras/tuya-cloud-source.js";
import { tuyaStreamAllocator } from "../src/cameras/tuya-stream-allocator.js";
import { record } from "./driver-helpers.js";

const RTSP = (n: number) => `rtsps://cloud.example:443/live/secret-token-${n}`;
const HLS = (n: number) => `https://cloud.example/hls/secret-token-${n}.m3u8`;
/** HLS carries AAC, which WebRTC cannot: go2rtc reads it through ffmpeg, audio to Opus. */
const HLS_SRC = (url: string) => `ffmpeg:${url}#video=copy#audio=opus`;
const camera = () => record({ brand: "TUYA", kind: "CAMERA", externalId: "bf-cam", streamSource: "CLOUD" });

type Reply = Partial<Record<CloudStreamType, "fail" | number>>;

/**
 * A fake allocator (each call answers per `reply`: fail, or a lifetime, with a fresh numbered URL) and
 * a fake go2rtc producer state for the camera's stream.
 */
function setup(initial: Reply = { rtsp: 300 }) {
  let reply = initial;
  let n = 0;
  let producing = false;
  const lines: string[] = [];
  const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const log = { info: vi.fn(capture), warn: vi.fn(capture) };
  const allocate = vi.fn(async (_id: string, type: CloudStreamType): Promise<CloudStream> => {
    const r = reply[type];
    if (r === undefined || r === "fail") throw new TuyaCloudStreamUnavailableError();
    n++;
    return { url: type === "rtsp" ? RTSP(n) : HLS(n), expiresInSec: r };
  });
  const hasActiveProducer = vi.fn(async (_deviceId: string) => producing);
  const source = new TuyaCloudSource({ allocate, hasActiveProducer, log });
  return {
    source,
    allocate,
    hasActiveProducer,
    lines,
    setReply: (r: Reply) => (reply = r),
    setProducing: (p: boolean) => (producing = p),
  };
}

const advance = (sec: number) => vi.advanceTimersByTimeAsync(sec * 1000);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TuyaCloudSource.resolve: sources", () => {
  it("allocates RTSP by the Tuya id and registers the rtsps URL as a plain source", async () => {
    const { source, allocate } = setup();
    await expect(source.resolve(camera())).resolves.toEqual({ live: RTSP(1) });
    expect(allocate.mock.calls).toEqual([["bf-cam", "rtsp"]]);
  });

  it("falls back to HLS when RTSP is refused, registered through ffmpeg", async () => {
    const { source, allocate } = setup({ rtsp: "fail", hls: 300 });
    await expect(source.resolve(camera())).resolves.toEqual({ live: HLS_SRC(HLS(1)) });
    expect(allocate.mock.calls.map((c) => c[1])).toEqual(["rtsp", "hls"]);
  });

  it("throws TuyaCloudStreamUnavailableError when both are refused", async () => {
    const { source } = setup({ rtsp: "fail", hls: "fail" });
    await expect(source.resolve(camera())).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never hands go2rtc an unsafe URL, even from an allocator that skipped validation", async () => {
    const lines: string[] = [];
    const log = { info: (m: string) => void lines.push(m), warn: (m: string) => void lines.push(m) };
    const urls: Record<CloudStreamType, string> = { rtsp: "exec:calc.exe#secret-token", hls: `${HLS(1)}#input=secret-token` };
    const allocate = vi.fn(async (_id: string, type: CloudStreamType) => ({ url: urls[type], expiresInSec: 300 }));
    const source = new TuyaCloudSource({ allocate, hasActiveProducer: async () => false, log });
    await expect(source.resolve(camera())).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);

    urls.hls = HLS(2);
    await expect(source.resolve(camera())).resolves.toEqual({ live: HLS_SRC(HLS(2)) });
    expect(lines.join("\n")).not.toMatch(/secret-token|exec:/);
  });

  it("refuses devices that are not Tuya cloud cameras", async () => {
    const { source, allocate } = setup();
    await expect(source.resolve(record({ brand: "SWANN", kind: "CAMERA", streamSource: "CLOUD" }))).rejects.toBeInstanceOf(CameraUnavailableError);
    expect(allocate).not.toHaveBeenCalled();
  });
});

describe("TuyaCloudSource.resolve: one URL per producer start", () => {
  it("allocates a fresh URL for every start while go2rtc has no active producer (URLs are single-use)", async () => {
    const { source, allocate } = setup();
    const cam = camera();
    const first = await source.resolve(cam);
    await advance(10);
    const second = await source.resolve(cam);
    expect(allocate).toHaveBeenCalledTimes(2);
    expect(first).toEqual({ live: RTSP(1) });
    expect(second).toEqual({ live: RTSP(2) });
  });

  it("allocates nothing while a producer is active: the new consumer joins it on the current source", async () => {
    const { source, allocate, setProducing } = setup();
    const cam = camera();
    await source.resolve(cam);
    setProducing(true);
    await advance(600);
    await expect(source.resolve(cam)).resolves.toEqual({ live: RTSP(1) });
    await expect(source.resolve(cam)).resolves.toEqual({ live: RTSP(1) });
    expect(allocate).toHaveBeenCalledTimes(1);

    setProducing(false);
    await expect(source.resolve(cam)).resolves.toEqual({ live: RTSP(2) });
  });

  it("allocates when go2rtc's producer state cannot be read", async () => {
    const { source, allocate, hasActiveProducer } = setup();
    const cam = camera();
    await source.resolve(cam);
    hasActiveProducer.mockRejectedValueOnce(new Error("go2rtc down"));
    await source.resolve(cam);
    expect(allocate).toHaveBeenCalledTimes(2);
  });

  it("does not check go2rtc for a camera it has no source for yet", async () => {
    const { source, hasActiveProducer } = setup();
    await source.resolve(camera());
    expect(hasActiveProducer).not.toHaveBeenCalled();
  });

  it("shares one allocation between concurrent starts", async () => {
    const { source, allocate } = setup();
    const cam = camera();
    const [a, b] = await Promise.all([source.resolve(cam), source.resolve(cam)]);
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("sets no timers (no refresh schedule)", async () => {
    const { source } = setup();
    await source.resolve(camera());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("TuyaCloudSource failures", () => {
  it("does not ask Tuya again for 60 s after a refusal: requests fail fast with the same error", async () => {
    const { source, allocate, setReply } = setup({ rtsp: "fail", hls: "fail" });
    const cam = camera();
    const err = await source.resolve(cam).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TuyaCloudStreamUnavailableError);
    expect(allocate).toHaveBeenCalledTimes(2);

    setReply({ rtsp: 300 });
    await advance(59);
    await expect(source.resolve(cam)).rejects.toBe(err);
    expect(allocate).toHaveBeenCalledTimes(2);

    await advance(1);
    await expect(source.resolve(cam)).resolves.toEqual({ live: RTSP(1) });
    expect(allocate).toHaveBeenCalledTimes(3);
  });

  it("holds back only the camera that was refused", async () => {
    const { source, allocate, setReply } = setup({ rtsp: "fail", hls: "fail" });
    await expect(source.resolve(camera())).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
    setReply({ rtsp: 300 });
    await expect(source.resolve(camera())).resolves.toBeDefined();
    expect(allocate).toHaveBeenCalledTimes(3);
  });

  it("skips HLS when RTSP was refused for the account (credentials, subscription), and logs why without a URL", async () => {
    const lines: string[] = [];
    const log = { info: (m: string) => void lines.push(m), warn: (m: string) => void lines.push(m) };
    const allocate = vi.fn(async (): Promise<CloudStream> => {
      throw new TuyaCloudStreamUnavailableError({ cause: new TuyaCloudAuthError("Tuya cloud error 1004: sign invalid", { code: 1004 }) });
    });
    const source = new TuyaCloudSource({ allocate, hasActiveProducer: async () => false, log });
    const cam = camera();
    await expect(source.resolve(cam)).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
    expect(allocate.mock.calls.map((c) => c[1])).toEqual(["rtsp"]);
    expect(lines).toContain(`streams: no cloud stream for camera ${cam.id} (TuyaCloudStreamUnavailableError (TuyaCloudAuthError 1004))`);
  });

  it("still tries HLS after any other RTSP refusal, logging the Tuya class and code", async () => {
    const lines: string[] = [];
    const log = { info: (m: string) => void lines.push(m), warn: (m: string) => void lines.push(m) };
    const allocate = vi.fn(async (_id: string, type: CloudStreamType): Promise<CloudStream> => {
      throw new TuyaCloudStreamUnavailableError({ cause: new TuyaCloudError(`Tuya cloud error 2001: ${type} rtsps://x/secret-token`, { code: 2001 }) });
    });
    const source = new TuyaCloudSource({ allocate, hasActiveProducer: async () => false, log });
    const cam = camera();
    await expect(source.resolve(cam)).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
    expect(allocate.mock.calls.map((c) => c[1])).toEqual(["rtsp", "hls"]);
    expect(lines).toContain(`streams: no cloud stream for camera ${cam.id} (TuyaCloudStreamUnavailableError (TuyaCloudError 2001))`);
    expect(lines.join("\n")).not.toMatch(/secret-token|rtsps:/);
  });

  it("never logs a stream URL", async () => {
    const { source, lines, setReply, setProducing } = setup({ rtsp: "fail", hls: 300 });
    const cam = camera();
    await source.resolve(cam);
    setProducing(true);
    await source.resolve(cam);
    setProducing(false);
    setReply({ rtsp: "fail", hls: "fail" });
    await source.resolve(cam).catch(() => undefined);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toMatch(/secret-token|cloud\.example|rtsps:|https:/);
  });
});

describe("tuyaStreamAllocator", () => {
  const creds = { accessId: "aid", accessSecret: "s", region: "eu" as const };

  it("allocates with the stored credentials, keeping one client while they are unchanged", async () => {
    let stored: typeof creds | undefined = creds;
    const allocateStream = vi.fn(async () => ({ url: RTSP(1), expiresInSec: 300 }));
    const factory = vi.fn(() => ({ allocateStream }));
    const allocate = tuyaStreamAllocator(async () => stored, factory);

    await expect(allocate("bf-cam", "rtsp")).resolves.toEqual({ url: RTSP(1), expiresInSec: 300 });
    await allocate("bf-cam", "hls");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(creds);
    expect(allocateStream.mock.calls).toEqual([["bf-cam", "rtsp"], ["bf-cam", "hls"]]);

    stored = { ...creds, accessSecret: "new" };
    await allocate("bf-cam", "rtsp");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("gives no stream without stored credentials (an account refusal: no point trying another type)", async () => {
    const factory = vi.fn();
    const err = await tuyaStreamAllocator(async () => undefined, factory)("bf-cam", "rtsp").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TuyaCloudStreamUnavailableError);
    expect((err as Error).cause).toBeInstanceOf(TuyaCloudAuthError);
    expect(factory).not.toHaveBeenCalled();
  });
});
